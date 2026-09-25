import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { activity } from "../state/activity.js";
import { api } from "../client/index.js";
import { mergeSystemWaypoints, mirror, storeKeys, upsertShip } from "../state/store.js";
import { prices } from "../state/prices.js";
import { shipyards } from "../state/shipyards.js";
import { SpaceTradersError } from "../transport/http.js";
import { getTool, type ToolContext } from "./registry.js";
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

const LOCK_TIMEOUT_MS = 30_000;

class ShipLocks {
  private tails = new Map<string, Promise<unknown>>();

  acquire(symbol: string): Promise<() => void> {
    const prev = this.tails.get(symbol) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(res => {
      release = res;
    });
    const next = prev.then(() => gate);
    this.tails.set(symbol, next);
    void next.catch(() => undefined).then(() => {
      if (this.tails.get(symbol) === next) this.tails.delete(symbol);
    });
    return prev.then(() => release);
  }
}

const locks = new ShipLocks();

const shipLock = (symbol: string) => withTimeout(locks.acquire(symbol), LOCK_TIMEOUT_MS, `ship lock timeout for ${symbol}`);

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
        return data;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }),
    shipyard: (system, wp) => memo(yardMemo, `${system}:${wp}`, async () => {
      try {
        const { data } = await api.getShipyard(system, wp);
        mirror.set(storeKeys.market(system, wp) + ":shipyard", data);
        shipyards.record(data);
        return data;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }),
    agent: async () => {
      const { data } = await api.myAgent();
      mirror.set(storeKeys.agent, data);
      return data;
    },
  };
}

export async function executeTool(name: string, rawArgs: unknown): Promise<ExecOutcome> {
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
  let unlock: (() => void) | null = null;
  const started = Date.now();
  try {
    // Lock first, then guards: guards fetch live state, so they must run
    // inside the ship's critical section or a queued call would validate
    // against pre-action state.
    if (shipSymbol) unlock = await shipLock(shipSymbol);
    if (tool.guards?.length) {
      for (const guard of tool.guards) {
        const g: GuardResult = await guard(tool.name, { args, fresh });
        guardResults.push({ guard: guard.name, ok: g.ok, reason: g.reason });
        if (!g.ok) {
          bus.emit({ type: "GuardFailed", ts: Date.now(), tool: name, guard: guard.name, reason: g.reason ?? "" });
          return recordActivityOutcome(
            { tool: name, outcome: "guard-rejected", summary: `guard ${guard.name}: ${g.reason}` },
            name, args, guardResults, 0, 0,
          );
        }
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
      name, args, guardResults, tool.rateCost, Date.now() - started,
    );
  } catch (err) {
    const summary = err instanceof Error ? err.message : String(err);
    return recordActivityOutcome(
      { tool: name, outcome: "api-error", summary },
      name, args, guardResults, tool.rateCost, Date.now() - started,
    );
  } finally {
    unlock?.();
  }
}

function recordActivityOutcome(
  outcome: ExecOutcome,
  tool: string,
  args: unknown,
  guards: { guard: string; ok: boolean; reason?: string | undefined }[],
  requests: number,
  durationMs: number,
): ExecOutcome {
  activity.append({
    kind: "tool",
    tool,
    args,
    outcome: outcome.outcome,
    result: outcome.outcome === "ok" ? outcome.result : outcome.summary,
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
    summary: outcome.summary,
    requestsSpent: requests,
    durationMs,
  });
  return outcome;
}
