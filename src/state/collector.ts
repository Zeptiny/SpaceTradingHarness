import { config } from "../config.js";
import { transport } from "../transport/http.js";
import { galaxy, PAGE_SIZE } from "./galaxy.js";
import { mirror, storeKeys, type FleetState } from "./store.js";
import { atlas, type KnownConstruction, type KnownGate, type KnownMarket, type KnownSystem, type KnownWaypoint } from "./atlas.js";
import { prices } from "./prices.js";
import { shipyards } from "./shipyards.js";
import { runtime } from "./runtime.js";
import { mergeSystemWaypoints } from "./store.js";
import { fetchMarket, fetchShipyard, refreshFleet } from "./refresh.js";
import { systemOf } from "../utils/symbols.js";
import type { Construction, JumpGate, Ship, System, Waypoint } from "../generated/types.js";

/**
 * Background collector: while the agent is asleep, spend a small request
 * budget on facts the agent would otherwise fetch itself, in priority order:
 *   1. map the fleet's systems (every waypoint with traits, once per reset)
 *   2. refresh prices at markets and shipyards where ships are parked
 *   3. read the jump gate and its construction progress
 *   4. read what every market in the fleet's systems trades (once)
 *   5. scout systems the gate connects to (coordinates, shipyards, markets)
 * It never runs during a wake, so it does not compete with the agent's own
 * actions for the ~2 req/s rate limit, and it stops as soon as a wake starts.
 */

export const PRICE_MAX_AGE_MS = 5 * 60_000;
export const SHIPYARD_MAX_AGE_MS = 30 * 60_000;
export const CONSTRUCTION_MAX_AGE_MS = 60 * 60_000;
const MAX_NEIGHBORS = 12;
const FAILURE_BACKOFF_MS = 60 * 60_000;

export type Task =
  | { kind: "system"; system: string }
  | { kind: "map"; system: string }
  | { kind: "prices"; waypoint: string }
  | { kind: "shipyard"; waypoint: string }
  | { kind: "gate"; waypoint: string }
  | { kind: "construction"; waypoint: string }
  | { kind: "market-list"; waypoint: string }
  | { kind: "scout"; system: string };

export interface PlannerView {
  system(symbol: string): KnownSystem | undefined;
  inSystem(system: string): KnownWaypoint[];
  gate(waypoint: string): KnownGate | undefined;
  construction(waypoint: string): KnownConstruction | undefined;
  market(waypoint: string): KnownMarket | undefined;
  pricedAt(waypoint: string): number | undefined;
  shipyardSeenAt(waypoint: string): number | undefined;
}

export interface ShipSpot {
  system: string;
  waypoint: string;
  inTransit: boolean;
}

export const taskKey = (t: Task): string => `${t.kind}:${"system" in t ? t.system : t.waypoint}`;

/** Pure: everything worth collecting now, highest priority first. */
export function planCollection(view: PlannerView, ships: ShipSpot[], now: number): Task[] {
  const tasks: Task[] = [];
  const systems = [...new Set(ships.map(s => s.system))];

  for (const system of systems) {
    const known = view.system(system);
    if (!known) tasks.push({ kind: "system", system });
    if (!known?.mapped) tasks.push({ kind: "map", system });
  }

  const parked = [...new Set(ships.filter(s => !s.inTransit).map(s => s.waypoint))];
  const stale = (ts: number | undefined, maxAge: number) => ts === undefined || now - ts > maxAge;
  const priceTasks = parked
    .filter(wp => view.inSystem(systemOf(wp)).find(w => w.symbol === wp)?.traits.includes("MARKETPLACE"))
    .filter(wp => stale(view.pricedAt(wp), PRICE_MAX_AGE_MS))
    .sort((a, b) => (view.pricedAt(a) ?? 0) - (view.pricedAt(b) ?? 0));
  tasks.push(...priceTasks.map(waypoint => ({ kind: "prices" as const, waypoint })));
  for (const wp of parked) {
    const w = view.inSystem(systemOf(wp)).find(x => x.symbol === wp);
    if (w?.traits.includes("SHIPYARD") && stale(view.shipyardSeenAt(wp), SHIPYARD_MAX_AGE_MS)) {
      tasks.push({ kind: "shipyard", waypoint: wp });
    }
  }

  const gates = systems
    .map(system => view.inSystem(system).find(w => w.type === "JUMP_GATE"))
    .filter((w): w is KnownWaypoint => !!w);
  for (const g of gates) {
    if (!view.gate(g.symbol)) tasks.push({ kind: "gate", waypoint: g.symbol });
    const cons = view.construction(g.symbol);
    if (g.underConstruction !== false && !cons?.isComplete && stale(cons?.fetchedAt, CONSTRUCTION_MAX_AGE_MS)) {
      tasks.push({ kind: "construction", waypoint: g.symbol });
    }
  }

  for (const system of systems) {
    for (const w of view.inSystem(system)) {
      // A price read also records what the market trades; don't read it twice.
      if (w.traits.includes("MARKETPLACE") && !view.market(w.symbol) && !priceTasks.includes(w.symbol)) {
        tasks.push({ kind: "market-list", waypoint: w.symbol });
      }
    }
  }

  for (const g of gates) {
    for (const conn of view.gate(g.symbol)?.connections.slice(0, MAX_NEIGHBORS) ?? []) {
      const system = systemOf(conn);
      if (systems.includes(system)) continue;
      const known = view.system(system);
      if (!known) tasks.push({ kind: "system", system });
      if (!known?.scouted && !known?.mapped) tasks.push({ kind: "scout", system });
    }
  }
  return tasks;
}

const liveView: PlannerView = {
  system: s => atlas.system(s),
  inSystem: s => atlas.inSystem(s),
  gate: w => atlas.gate(w),
  construction: w => atlas.construction(w),
  market: w => atlas.market(w),
  pricedAt: w => prices.marketsSeen().get(w),
  shipyardSeenAt: w => shipyards.seenAt(w),
};

const failedAt = new Map<string, number>();

async function runTask(t: Task, spend: (need?: number) => boolean): Promise<void> {
  switch (t.kind) {
    case "system": {
      if (!spend()) return;
      const { data } = await transport.request<System>("getSystem", { path: { systemSymbol: t.system } });
      atlas.recordSystem(data);
      return;
    }
    case "map": {
      let page = atlas.system(t.system)?.nextPage;
      if (page === undefined) return; // system record failed this tick; retried next tick
      while (spend()) {
        const r = await transport.request<Waypoint[]>("getSystemWaypoints", {
          path: { systemSymbol: t.system },
          query: { limit: 20, page },
        });
        atlas.record(r.data);
        mergeSystemWaypoints(t.system, r.data);
        const total = (r.meta as { total?: number } | undefined)?.total;
        const done = r.data.length < 20 || (total !== undefined && page * 20 >= total);
        atlas.markMapPage(t.system, page, done);
        if (done) return;
        page++;
      }
      return;
    }
    case "prices":
    case "market-list": {
      if (!spend()) return;
      await fetchMarket(systemOf(t.waypoint), t.waypoint);
      return;
    }
    case "shipyard": {
      if (!spend()) return;
      await fetchShipyard(systemOf(t.waypoint), t.waypoint);
      return;
    }
    case "gate": {
      if (!spend()) return;
      const system = systemOf(t.waypoint);
      const { data } = await transport.request<JumpGate>("getJumpGate", { path: { systemSymbol: system, waypointSymbol: t.waypoint } });
      atlas.recordGate(data, system);
      return;
    }
    case "construction": {
      if (!spend()) return;
      const { data } = await transport.request<Construction>("getConstruction", {
        path: { systemSymbol: systemOf(t.waypoint), waypointSymbol: t.waypoint },
      });
      atlas.recordConstruction(data);
      return;
    }
    case "scout": {
      if (!atlas.system(t.system)) return;
      // Two reads; start only if both fit, or the first is wasted when the budget runs out.
      for (const [i, traits] of ["SHIPYARD", "MARKETPLACE"].entries()) {
        if (!spend(i === 0 ? 2 : 1)) return;
        const r = await transport.request<Waypoint[]>("getSystemWaypoints", {
          path: { systemSymbol: t.system },
          query: { limit: 20, page: 1, traits },
        });
        atlas.record(r.data);
      }
      atlas.markScouted(t.system);
      return;
    }
  }
}

/**
 * Maps a system completely right now (system record + every waypoint page),
 * so the first wake in a new system never reasons from a partial map.
 */
export async function mapSystem(system: string): Promise<void> {
  if (atlas.system(system)?.mapped) return;
  let budget = 12;
  const spend = (need = 1): boolean => {
    if (budget < need) return false;
    budget -= need;
    return true;
  };
  if (!atlas.system(system)) await runTask({ kind: "system", system }, spend);
  await runTask({ kind: "map", system }, spend);
}

const spot = (s: Ship): ShipSpot => ({ system: s.nav.systemSymbol, waypoint: s.nav.waypointSymbol, inTransit: s.nav.status === "IN_TRANSIT" });

/** One collection pass. Returns the number of requests spent (the fleet read included). */
export async function collectOnce(maxRequests: number): Promise<number> {
  if (runtime.wake || runtime.paused || maxRequests <= 0) return 0;
  const ships = await refreshFleet();
  let spent = 1;
  if (!ships?.length) return spent;
  // `need` lets a multi-read task check it can finish before starting.
  const spend = (need = 1): boolean => {
    if (runtime.wake || spent + need > maxRequests) return false; // yield to the agent the moment a wake starts
    spent++;
    return true;
  };
  // Re-plan after each pass: finishing the map reveals markets and the gate,
  // which become tasks only once they are known.
  for (let pass = 0; pass < 4; pass++) {
    const before = spent;
    for (const task of planCollection(liveView, ships.map(spot), Date.now())) {
      if (runtime.wake || spent >= maxRequests) return spent;
      const key = taskKey(task);
      if (Date.now() - (failedAt.get(key) ?? 0) < FAILURE_BACKOFF_MS) continue;
      try {
        await runTask(task, spend);
      } catch (err) {
        failedAt.set(key, Date.now());
        console.warn(`[collector] ${key} failed:`, err instanceof Error ? err.message : err);
      }
    }
    if (spent === before) break;
  }
  return spent;
}

const DUMP_TIMEOUT_MS = 180_000;

/**
 * Fills the panel's galaxy map (see galaxy.ts): the bulk dump once, else up to
 * `maxRequests` system-list pages. Same rules as collectOnce: only while the
 * agent sleeps, and it stops the moment a wake starts. Returns requests spent.
 */
export async function collectGalaxy(maxRequests: number): Promise<number> {
  if (runtime.wake || runtime.paused || maxRequests <= 0) return 0;
  const fleetSystems = (mirror.get<FleetState>(storeKeys.fleet)?.ships ?? []).map(s => s.nav.systemSymbol);
  if (galaxy.resetIfStale(fleetSystems)) console.log("[collector] galaxy map is from an earlier reset; refetching");
  if (galaxy.complete) return 0;
  let spent = 0;
  if (galaxy.dumpDue()) {
    spent++;
    try {
      const systems = await transport.requestRaw<System[]>("/systems.json", DUMP_TIMEOUT_MS);
      if (!Array.isArray(systems) || !systems.length) throw new Error("empty or unexpected dump");
      galaxy.recordDump(systems);
      console.log(`[collector] galaxy map: ${systems.length} systems from the bulk dump`);
      return spent;
    } catch (err) {
      galaxy.dumpFailed();
      console.warn("[collector] bulk systems dump unavailable, paging instead:", err instanceof Error ? err.message : err);
    }
  }
  while (spent < maxRequests && !runtime.wake && !galaxy.complete) {
    spent++;
    const page = galaxy.nextPage;
    const r = await transport.request<System[]>("getSystems", { query: { limit: PAGE_SIZE, page } });
    galaxy.recordPage(page, r.data, (r.meta as { total?: number } | undefined)?.total);
  }
  if (galaxy.complete) console.log(`[collector] galaxy map complete: ${galaxy.status().count} systems`);
  return spent;
}

export function startCollector(): void {
  const { collectorIntervalMs, collectorRequests, galaxyPagesPerPass } = config.agent;
  if (collectorIntervalMs <= 0 || (collectorRequests <= 0 && galaxyPagesPerPass <= 0)) return;
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    collectOnce(collectorRequests)
      .catch(err => console.warn("[collector] pass failed:", err instanceof Error ? err.message : err))
      .then(() => collectGalaxy(galaxyPagesPerPass))
      .catch(err => console.warn("[collector] galaxy pass failed:", err instanceof Error ? err.message : err))
      .finally(() => {
        busy = false;
      });
  }, collectorIntervalMs).unref();
  console.log(`[collector] every ${collectorIntervalMs / 1000}s, up to ${collectorRequests} requests while the agent sleeps`);
}
