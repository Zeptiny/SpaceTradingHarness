import { api } from "../client/index.js";
import { config } from "../config.js";
import { atlas } from "../state/atlas.js";
import { creditHistory } from "../state/credits.js";
import { prices } from "../state/prices.js";
import { runtime } from "../state/runtime.js";
import { routines, describeSpec, type RoutineRecord } from "../state/routines.js";
import { fetchMarket, fetchWaypoint, refreshContracts } from "../state/refresh.js";
import { upsertShip } from "../state/store.js";
import { activity } from "../state/activity.js";
import { executeTool, type ExecOutcome } from "../tools/executor.js";
import { scheduler } from "../agent/scheduler.js";
import { systemOf } from "../utils/symbols.js";
import {
  decideGoto, decideMine, decideScout, decideTrade, transitWait,
  type ContractNeed, type MapView, type Quote, type ShipView, type Step, type World,
} from "./decide.js";
import type { Ship } from "../generated/types.js";

/**
 * Runs ship routines: one async loop per ship that asks decide.ts for the
 * next step and executes it through the normal tools. The agent is woken only
 * when a routine stops (margin gone, hold stuck, repeated errors) or a goto
 * arrives. Routine steps don't use the agent's action budget or LLM rounds.
 */
const MAX_SLEEP_MS = 5 * 60_000;
const STEP_GAP_MS = 300;
const MAX_FAILURES = 3;
const CONTRACTS_TTL_MS = 60_000;

const loops = new Map<string, { wake: () => void }>();
let contractsCache: { at: number; needs: ContractNeed[] } | null = null;

function sleep(ship: string, ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(done, Math.min(ms, MAX_SLEEP_MS));
    function done() {
      clearTimeout(timer);
      const entry = loops.get(ship);
      if (entry) entry.wake = () => undefined;
      resolve();
    }
    const entry = loops.get(ship);
    if (entry) entry.wake = done;
  });
}

export function toShipView(s: Ship, now = Date.now()): ShipView {
  const cdEnd = s.cooldown?.expiration ? Date.parse(s.cooldown.expiration) : NaN;
  const cooldownMs = Number.isFinite(cdEnd) ? Math.max(0, cdEnd - now) : Math.max(0, (s.cooldown?.remainingSeconds ?? 0) * 1000);
  return {
    symbol: s.symbol,
    system: s.nav.systemSymbol,
    waypoint: s.nav.waypointSymbol,
    status: s.nav.status,
    arrivalAt: s.nav.status === "IN_TRANSIT" && s.nav.route?.arrival ? Date.parse(s.nav.route.arrival) : null,
    cooldownMs,
    cargo: { capacity: s.cargo.capacity, units: s.cargo.units, inventory: s.cargo.inventory.map(i => ({ symbol: i.symbol, units: i.units })) },
    fuel: { current: s.fuel.current, capacity: s.fuel.capacity },
  };
}

export const liveMap: MapView = {
  point: symbol => {
    const w = atlas.get(symbol);
    return w ? { symbol, x: w.x, y: w.y, fuel: atlas.sellsFuel(symbol) } : null;
  },
  stations: system => atlas.inSystem(system).filter(w => atlas.sellsFuel(w.symbol)).map(w => ({ symbol: w.symbol, x: w.x, y: w.y, fuel: true })),
  gates: () => atlas.allGates(),
  get autoRefuel() {
    return config.agent.autoRefuel;
  },
};

function quote(waypoint: string, good: string): Quote | null {
  const p = prices.query({ waypoint, good, limit: 1 })[0];
  if (!p) return null;
  return { type: p.type ?? "EXCHANGE", youPay: p.purchasePrice, youGet: p.sellPrice, tradeVolume: p.volume ?? 1, ts: p.ts };
}

async function contractNeeds(): Promise<ContractNeed[]> {
  if (contractsCache && Date.now() - contractsCache.at < CONTRACTS_TTL_MS) return contractsCache.needs;
  const contracts = await refreshContracts();
  const needs: ContractNeed[] = [];
  for (const c of contracts ?? []) {
    if (!c.accepted || c.fulfilled || Date.parse(c.terms.deadline) < Date.now()) continue;
    for (const d of c.terms.deliver ?? []) {
      if (d.unitsFulfilled < d.unitsRequired) {
        needs.push({ contractId: c.id, good: d.tradeSymbol, destination: d.destinationSymbol, remaining: d.unitsRequired - d.unitsFulfilled });
      }
    }
  }
  contractsCache = { at: Date.now(), needs };
  return needs;
}

const MINABLE_TYPES = ["ASTEROID", "ASTEROID_FIELD", "ENGINEERED_ASTEROID"];

async function buildWorld(rec: RoutineRecord): Promise<World> {
  const seen = prices.marketsSeen();
  return {
    now: Date.now(),
    credits: creditHistory.latest()?.credits ?? null,
    minCredits: config.agent.routineMinCredits,
    quote,
    contractNeeds: rec.spec.kind === "mine" && rec.spec.deliverContract ? await contractNeeds() : [],
    markets: system => atlas.inSystem(system)
      .filter(w => w.traits.includes("MARKETPLACE"))
      .map(w => ({ symbol: w.symbol, pricedAt: seen.get(w.symbol) ?? null })),
    claimed: routines.running().filter(r => r.ship !== rec.ship && r.target).map(r => r.target!),
    map: liveMap,
    uncharted: system => atlas.inSystem(system).filter(w => w.traits.includes("UNCHARTED")).map(w => w.symbol),
    asteroids: system => atlas.inSystem(system)
      .filter(w => MINABLE_TYPES.includes(w.type))
      .map(w => ({ symbol: w.symbol, deposits: w.traits.filter(t => t.endsWith("_DEPOSITS") || t === "ICE_CRYSTALS"), depleted: atlas.depleted(w.symbol) })),
  };
}

// Coordinates must be known to plan legs; look up the few the atlas lacks.
async function ensureKnown(ship: ShipView, rec: RoutineRecord): Promise<void> {
  const wanted = [ship.waypoint];
  const s = rec.spec;
  if (s.kind === "trade") wanted.push(s.buyAt, s.sellAt);
  else if (s.kind === "mine") wanted.push(s.asteroid, ...(s.sellAt ? [s.sellAt] : []));
  else if (s.kind === "goto") wanted.push(s.destination);
  for (const wp of wanted) {
    if (!atlas.get(wp)) await fetchWaypoint(systemOf(wp), wp).catch(() => undefined);
  }
}

function decide(rec: RoutineRecord, ship: ShipView, world: World): Step & { target?: string } {
  const wait = transitWait(ship, world.now);
  if (wait) return wait;
  switch (rec.spec.kind) {
    case "trade": return decideTrade(rec.spec, ship, world);
    case "mine": return decideMine(rec.spec, ship, world);
    case "scout": return decideScout(rec.spec, ship, world, rec.target);
    case "goto": return decideGoto(rec.spec, ship, world);
  }
}

async function execute(ship: string, step: Step): Promise<ExecOutcome | null> {
  const run = (tool: string, args: Record<string, unknown>) => executeTool(tool, { shipSymbol: ship, ...args }, { source: "routine" });
  switch (step.do) {
    case "navigate": return run("navigate", { waypointSymbol: step.to, flightMode: step.mode });
    case "jump": return run("jump", { waypointSymbol: step.to });
    case "orbit": return run("orbit", {});
    case "refuel": return run("refuel", {});
    case "buy": return run("buy_cargo", { symbol: step.good, units: step.units });
    case "sell_all": return run("sell_all", { ...(step.goods ? { goods: step.goods } : {}), ...(step.keep ? { keep: step.keep } : {}) });
    case "jettison": return run("jettison", { symbol: step.good, units: step.units });
    case "extract": return run("extract", {});
    case "deliver": {
      contractsCache = null;
      return executeTool("deliver_contract_cargo", { contractId: step.contractId, shipSymbol: ship, tradeSymbol: step.good, units: step.units }, { source: "routine" });
    }
    case "read_market": {
      await fetchMarket(systemOf(step.waypoint), step.waypoint);
      return null;
    }
    case "chart": return run("chart_waypoint", {});
    default: return null;
  }
}

function transactionTotal(o: ExecOutcome): number {
  const r = o.result as { transaction?: { totalPrice?: number }; revenue?: number } | undefined;
  if (typeof r?.revenue === "number") return r.revenue;
  return r?.transaction?.totalPrice ?? 0;
}

function finish(ship: string, status: "stopped" | "done", reason: string): void {
  const rec = routines.end(ship, status, reason);
  if (!rec) return;
  const what = describeSpec(rec.spec);
  activity.append({ kind: "system", text: `${ship} routine ${status}: ${what} — ${reason} (trips ${rec.trips}, trade profit ${rec.profit})` });
  const label = status === "done" ? `${ship} ${reason}` : `${ship} routine stopped (${what}): ${reason}`;
  scheduler.schedule(Date.now() + 1_000, label, ship);
}

async function runLoop(ship: string): Promise<void> {
  let failures = 0;
  let lastFailure = "";
  for (;;) {
    const rec = routines.active(ship);
    if (!rec) return;
    if (runtime.paused) {
      await sleep(ship, 5_000);
      continue;
    }
    try {
      const { data } = await api.getShip(ship);
      upsertShip(data);
      const view = toShipView(data);
      await ensureKnown(view, rec);
      const world = await buildWorld(rec);
      const step = decide(rec, view, world);
      if (!routines.active(ship)) return; // cancelled while deciding
      if (step.do === "stop" || step.do === "done") {
        finish(ship, step.do === "done" ? "done" : "stopped", step.reason);
        return;
      }
      const patch: Partial<RoutineRecord> = { phase: step.phase };
      if ("target" in step && step.target !== rec.target) {
        if (rec.target && rec.target === view.waypoint) patch.trips = rec.trips + 1; // scout finished a market
        patch.target = step.target;
      }
      routines.update(ship, patch);
      if (step.do === "wait") {
        await sleep(ship, step.ms);
        continue;
      }
      const outcome = await execute(ship, step);
      if (outcome && outcome.outcome !== "ok") {
        failures++;
        lastFailure = `${outcome.tool}: ${outcome.summary}`;
        if (failures >= MAX_FAILURES) {
          finish(ship, "stopped", `${MAX_FAILURES} failed steps in a row, last ${lastFailure}`);
          return;
        }
        await sleep(ship, 5_000 * failures);
        continue;
      }
      failures = 0;
      if (outcome && (step.do === "buy" || step.do === "sell_all")) {
        const cur = routines.get(ship)!;
        const amount = transactionTotal(outcome);
        const sold = step.do === "sell_all" && amount > 0;
        routines.update(ship, {
          profit: cur.profit + (step.do === "buy" ? -amount : amount),
          ...(sold && rec.spec.kind !== "scout" ? { trips: cur.trips + 1 } : {}),
        });
      }
      await sleep(ship, STEP_GAP_MS);
    } catch (err) {
      failures++;
      lastFailure = err instanceof Error ? err.message : String(err);
      if (failures >= MAX_FAILURES) {
        finish(ship, "stopped", `${MAX_FAILURES} errors in a row, last: ${lastFailure}`);
        return;
      }
      await sleep(ship, 10_000 * failures);
    }
  }
}

/** Starts (or restarts) the loop for a ship whose routine record is running. */
export function launch(ship: string): void {
  const existing = loops.get(ship);
  if (existing) {
    existing.wake(); // a running loop re-reads its record on the next pass
    return;
  }
  loops.set(ship, { wake: () => undefined });
  void runLoop(ship)
    .catch(err => console.error(`[routines] ${ship} loop crashed:`, err))
    .finally(() => {
      loops.delete(ship);
      // A new routine assigned while this loop was winding down needs its own loop.
      if (routines.active(ship)) launch(ship);
    });
}

/** Stops a ship's routine; its loop exits at the next step boundary. */
export function cancel(ship: string, reason = "cancelled by agent"): RoutineRecord | undefined {
  const rec = routines.active(ship);
  if (!rec) return undefined;
  const ended = routines.end(ship, "stopped", reason);
  loops.get(ship)?.wake();
  return ended;
}

/** Resume routines that were running when the harness last stopped. */
export function startRoutines(): void {
  const running = routines.running();
  for (const r of running) launch(r.ship);
  if (running.length) console.log(`[routines] resumed ${running.map(r => `${r.ship} (${describeSpec(r.spec)})`).join(", ")}`);
}
