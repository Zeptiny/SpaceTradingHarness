import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { activity } from "../state/activity.js";
import { api } from "../client/index.js";
import { mergeSystemWaypoints, mirror, observeAgent, storeKeys, upsertShip } from "../state/store.js";
import { refreshContracts } from "../state/refresh.js";
import { prices } from "../state/prices.js";
import { shipyards } from "../state/shipyards.js";
import { atlas } from "../state/atlas.js";
import { routines, describeSpec } from "../state/routines.js";
import { countRequests, SpaceTradersError } from "../transport/http.js";
import { getTool, type ToolContext } from "./registry.js";
import { ShipLocks } from "./shipLocks.js";
import type { FreshReader, GuardResult } from "../guards/index.js";
import type { Market, Ship, Shipyard, Waypoint } from "../generated/types.js";

export interface ExecOutcome {
  tool: string;
  outcome: "ok" | "guard-rejected" | "api-error" | "blocked-by-policy" | "local-error" | "unknown-tool";
  summary: string;
  result?: unknown | undefined;
  followUpWakeAt?: number | undefined;
  followUpReason?: string | undefined;
}

// A ship's lock is held for a whole tool call, including its wait in the
// shared request queue, and with a big fleet that wait alone can run past a
// minute (see the routine steps' durations in the activity log).
const LOCK_TIMEOUT_MS = 180_000;

const locks = new ShipLocks();

const shipLock = (symbol: string, label?: string) => locks.acquire(symbol, LOCK_TIMEOUT_MS, label);

// Per-tool-call fresh reader: every resource is fetched live from the API and
// memoized only for the duration of a single tool call (guards + handler
// share one read). Fetched values are mirrored for the panel as a side effect.
function makeFreshReader(): FreshReader {
  const shipMemo = new Map<string, Promise<Ship | undefined>>();
  const wpMemo = new Map<string, Promise<Waypoint | undefined>>();
  const mktMemo = new Map<string, Promise<Market | undefined>>();
  const yardMemo = new Map<string, Promise<Shipyard | undefined>>();
  const isNotFound = (err: unknown): boolean => err instanceof SpaceTradersError && err.status === 404;

  const memo = <K, V>(m: Map<K, Promise<V>>, k: K, make: () => Promise<V>): Promise<V> => {
    const existing = m.get(k);
    if (existing) return existing;
    const p = make();
    m.set(k, p);
    return p;
  };

  return {
    ship: symbol => memo(shipMemo, symbol, async () => {
      try {
        const { data: ship } = await api.getShip(symbol);
        upsertShip(ship);
        return ship;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }),
    waypoint: (system, wp) => memo(wpMemo, `${system}:${wp}`, async () => {
      try {
        const { data } = await api.getWaypoint(system, wp);
        mirror.set(storeKeys.waypoint(system, wp), data);
        mergeSystemWaypoints(system, [data]);
        atlas.record([data]);
        return data;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }),
    market: (system, wp) => memo(mktMemo, `${system}:${wp}`, async () => {
      try {
        const { data } = await api.getMarket(system, wp);
        mirror.set(storeKeys.market(system, wp), data);
        prices.record(data);
        atlas.recordMarket(data);
        return data;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }),
    shipyard: (system, wp) => memo(yardMemo, `${system}:${wp}`, async () => {
      try {
        const { data } = await api.getShipyard(system, wp);
        mirror.set(storeKeys.shipyard(system, wp), data);
        shipyards.record(data);
        return data;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }),
    agent: async () => {
      const { data } = await api.myAgent();
      observeAgent(data);
      return data;
    },
    contracts: () => refreshContracts(),
  };
}

export interface ExecOptions {
  /** "routine" when a ship routine runs the call; agent calls on a ship that runs a routine are refused. */
  source?: "agent" | "routine";
}

// Tools the agent may call on a ship while it runs a routine. They only change
// the routine record, so they skip the ship lock: a routine step can hold it
// for a long time, and cancelling must not queue behind the step it cancels.
const ROUTINE_CONTROL = new Set(["assign_routine", "cancel_routine"]);

export async function executeTool(name: string, rawArgs: unknown, opts: ExecOptions = {}): Promise<ExecOutcome> {
  const source = opts.source ?? "agent";
  const tool = getTool(name);
  if (!tool) {
    return recordActivityOutcome({ tool: name, outcome: "unknown-tool", summary: `unknown tool ${name}` }, name, rawArgs, [], 0, 0);
  }

  const parsed = tool.input.safeParse(rawArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    return recordActivityOutcome(
      { tool: name, outcome: "local-error", summary: `invalid args: ${issues}` },
      name, rawArgs, [], 0, 0,
    );
  }
  const args = parsed.data as Record<string, unknown>;

  if (config.agent.policy === "readonly" && tool.kind === "action") {
    return recordActivityOutcome(
      { tool: name, outcome: "blocked-by-policy", summary: `policy=readonly blocks ${name}` },
      name, args, [], 0, 0,
    );
  }

  const guardResults: { guard: string; ok: boolean; reason?: string | undefined }[] = [];
  const fresh = makeFreshReader();
  const shipSymbol = typeof args["shipSymbol"] === "string" ? (args["shipSymbol"] as string) : null;
  const busy = source === "agent" && tool.kind === "action" && shipSymbol && !ROUTINE_CONTROL.has(name) ? routines.active(shipSymbol) : undefined;
  if (busy) {
    return recordActivityOutcome(
      {
        tool: name,
        outcome: "guard-rejected",
        summary: `guard routineFree: ${shipSymbol} is running a routine (${describeSpec(busy.spec)}, ${busy.phase}); cancel_routine first, or assign_routine to give it a different one`,
      },
      name, args, [], 0, 0,
    );
  }
  const requests = { n: 0 };
  const lock: { release?: () => void } = {};
  const started = Date.now();
  try {
    return await countRequests(requests, async () => {
      // Lock first, then guards: guards fetch live state, so they must run
      // inside the ship's critical section or a queued call would validate
      // against pre-action state.
      if (shipSymbol && !ROUTINE_CONTROL.has(name)) lock.release = await shipLock(shipSymbol, source === "routine" ? `routine ${name}` : name);
      for (const guard of tool.guards ?? []) {
        const g: GuardResult = await guard(tool.name, { args, fresh });
        guardResults.push({ guard: guard.name, ok: g.ok, reason: g.reason });
        if (!g.ok) {
          bus.emit({ type: "GuardFailed", ts: Date.now(), tool: name, guard: guard.name, reason: g.reason ?? "" });
          return recordActivityOutcome(
            { tool: name, outcome: "guard-rejected", summary: `guard ${guard.name}: ${g.reason}` },
            name, args, guardResults, requests.n, Date.now() - started, source,
          );
        }
      }
      const res = await tool.handler(args, { shipLock, fresh });
      return recordActivityOutcome(
        {
          tool: name,
          outcome: "ok",
          summary: res.summary,
          result: res.result,
          followUpWakeAt: res.followUpWakeAt,
          followUpReason: res.followUpReason,
        },
        name, args, guardResults, requests.n, Date.now() - started, source,
      );
    });
  } catch (err) {
    return recordActivityOutcome(
      { tool: name, outcome: "api-error", summary: errorSummary(err) },
      name, args, guardResults, requests.n, Date.now() - started, source,
    );
  } finally {
    lock.release?.();
  }
}

// SpaceTraders puts the actionable detail (fuel required, cooldown left, …)
// in error.data — pass it through so the agent can adapt without re-reading.
function errorSummary(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof SpaceTradersError && err.data !== undefined) {
    const data = JSON.stringify(err.data);
    return `${msg} — data: ${data.length > 400 ? data.slice(0, 400) + "…" : data}`;
  }
  return msg;
}

function recordActivityOutcome(
  outcome: ExecOutcome,
  tool: string,
  args: unknown,
  guards: { guard: string; ok: boolean; reason?: string | undefined }[],
  requests: number,
  durationMs: number,
  source: "agent" | "routine" = "agent",
): ExecOutcome {
  // Routine steps are marked in the log so the operator can tell them from the agent's own calls.
  const logged = source === "routine" ? `[routine] ${outcome.summary}` : outcome.summary;
  activity.append({
    kind: "tool",
    tool,
    args,
    outcome: outcome.outcome,
    summary: logged,
    result: outcome.outcome === "ok" ? outcome.result : undefined,
    guards,
    requestsSpent: requests,
    durationMs,
  });
  bus.emit({
    type: "ToolCalled",
    ts: Date.now(),
    tool,
    args,
    outcome: outcome.outcome,
    summary: logged,
    requestsSpent: requests,
    durationMs,
  });
  return outcome;
}
