import { planJumps, planRoute, type GateLink, type RoutePoint } from "../utils/route.js";
import { systemOf } from "../utils/symbols.js";
import type { RoutineSpec } from "../state/routines.js";

/**
 * Pure step decisions for ship routines. Each call looks at the ship and what
 * the harness knows right now and returns the single next step; the engine
 * executes it through the normal tools (guards, locks, activity log) and asks
 * again. Being stateless, a routine resumes correctly after a restart or
 * after the ship was moved by hand.
 */
export interface ShipView {
  symbol: string;
  system: string;
  waypoint: string;
  status: "DOCKED" | "IN_ORBIT" | "IN_TRANSIT";
  /** Epoch ms of arrival, when in transit. */
  arrivalAt: number | null;
  cooldownMs: number;
  cargo: { capacity: number; units: number; inventory: { symbol: string; units: number }[] };
  fuel: { current: number; capacity: number };
}

export interface Quote {
  type: string; // EXPORT | IMPORT | EXCHANGE
  youPay: number | null;
  youGet: number | null;
  tradeVolume: number;
  ts: number;
}

export interface ContractNeed {
  contractId: string;
  good: string;
  destination: string;
  remaining: number;
}

export interface MapView {
  point(symbol: string): RoutePoint | null;
  stations(system: string): RoutePoint[];
  gates(): GateLink[];
  /** The harness tops up fuel before departures (AGENT_AUTO_REFUEL). */
  autoRefuel: boolean;
}

export interface World {
  now: number;
  credits: number | null;
  minCredits: number;
  quote(waypoint: string, good: string): Quote | null;
  contractNeeds: ContractNeed[];
  /** Markets in a system with when they were last priced (null = never). */
  markets(system: string): { symbol: string; pricedAt: number | null }[];
  /** Markets other scouts are heading to. */
  claimed: string[];
  map: MapView;
  /** Waypoints in a system whose traits are still hidden (UNCHARTED). */
  uncharted?: (system: string) => string[];
  /** Minable waypoints in a system with their deposit traits and whether they were recently seen over-mined. */
  asteroids?: (system: string) => AsteroidView[];
}

export interface AsteroidView {
  symbol: string;
  deposits: string[];
  depleted: boolean;
}

export type Step =
  | { do: "wait"; ms: number; phase: string }
  | { do: "navigate"; to: string; mode: "CRUISE" | "DRIFT"; phase: string }
  | { do: "jump"; to: string; phase: string }
  | { do: "orbit"; phase: string }
  | { do: "refuel"; phase: string }
  | { do: "read_market"; waypoint: string; phase: string }
  | { do: "chart"; phase: string }
  | { do: "buy"; good: string; units: number; phase: string }
  | { do: "sell_all"; goods?: string[]; keep?: string[]; phase: string }
  | { do: "jettison"; good: string; units: number; phase: string }
  | { do: "extract"; phase: string }
  | { do: "deliver"; contractId: string; good: string; units: number; phase: string }
  | { do: "done"; reason: string }
  | { do: "stop"; reason: string };

// A buy price older than this is re-read before buying.
export const QUOTE_FRESH_MS = 60_000;
// Scouts leave markets priced more recently than this alone.
export const SCOUT_FRESH_MS = 10 * 60_000;
const ARRIVAL_SLACK_MS = 1_500;

const qty = (ship: ShipView, good: string) => ship.cargo.inventory.find(i => i.symbol === good)?.units ?? 0;
const free = (ship: ShipView) => ship.cargo.capacity - ship.cargo.units;
const buys = (q: Quote | null) => !!q && (q.type === "IMPORT" || q.type === "EXCHANGE");
const sells = (q: Quote | null) => !!q && (q.type === "EXPORT" || q.type === "EXCHANGE");

/** Default margin floor: 5% of the buy price, at least 20 cr per unit. */
export function defaultMarginFloor(youPay: number): number {
  return Math.max(20, Math.round(youPay * 0.05));
}

/** The next step toward `dest`, or null when the ship is already there. */
export function travelStep(ship: ShipView, dest: string, map: MapView): Step | null {
  if (ship.waypoint === dest) return null;
  const destSystem = systemOf(dest);
  if (destSystem !== ship.system) {
    const path = planJumps(ship.system, destSystem, map.gates());
    if (!path || path.length < 2) return { do: "stop", reason: `no known jump-gate route from ${ship.system} to ${destSystem}` };
    const [gate, next] = path as [string, string];
    if (ship.waypoint !== gate) return travelStep(ship, gate, map);
    if (ship.status === "DOCKED") return { do: "orbit", phase: `at gate ${gate}` };
    if (ship.cooldownMs > 0) return { do: "wait", ms: ship.cooldownMs + 1_000, phase: `jump cooldown at ${gate}` };
    return { do: "jump", to: next, phase: `jumping to ${systemOf(next)} toward ${dest}` };
  }
  const from = map.point(ship.waypoint);
  const to = map.point(dest);
  if (!from || !to) return { do: "stop", reason: `coordinates unknown for ${!from ? ship.waypoint : dest}` };
  if (!map.autoRefuel && from.fuel && ship.fuel.current < ship.fuel.capacity) return { do: "refuel", phase: `refueling at ${ship.waypoint}` };
  const legs = planRoute({
    from,
    to,
    stations: map.stations(ship.system),
    fuel: ship.fuel.current,
    capacity: ship.fuel.capacity,
    refuelAtStart: map.autoRefuel,
  });
  if (!legs?.length) return { do: "stop", reason: `no route from ${ship.waypoint} to ${dest} within fuel range` };
  const leg = legs[0]!;
  const via = legs.length > 1 ? ` (fuel stop ${leg.to}, ${legs.length} legs)` : "";
  return { do: "navigate", to: leg.to, mode: leg.mode, phase: `flying to ${dest}${via}` };
}

/** Shared prelude: a ship in transit just waits for its arrival. */
export function transitWait(ship: ShipView, now: number): Step | null {
  if (ship.status !== "IN_TRANSIT") return null;
  const ms = Math.max(0, (ship.arrivalAt ?? now) - now) + ARRIVAL_SLACK_MS;
  return { do: "wait", ms, phase: `in transit` };
}

export function decideTrade(spec: Extract<RoutineSpec, { kind: "trade" }>, ship: ShipView, w: World): Step {
  const { good, buyAt, sellAt } = spec;
  const have = qty(ship, good);
  const toSell = (): Step => travelStep(ship, sellAt, w.map) ?? { do: "sell_all", goods: [good], phase: `selling ${good}` };

  if (have > 0 && ship.waypoint === sellAt) {
    const q = w.quote(sellAt, good);
    if (q && !buys(q)) return { do: "stop", reason: `${sellAt} no longer buys ${good} (${q.type})` };
    return { do: "sell_all", goods: [good], phase: `selling ${have} ${good}` };
  }
  if (have > 0 && ship.waypoint !== buyAt) return toSell();
  if (ship.waypoint !== buyAt) return travelStep(ship, buyAt, w.map) ?? { do: "stop", reason: "unreachable" };

  // At the buy market: fill up while the spread holds.
  const q = w.quote(buyAt, good);
  if (!q || w.now - q.ts > QUOTE_FRESH_MS) return { do: "read_market", waypoint: buyAt, phase: `pricing ${good} at ${buyAt}` };
  if (!sells(q) || q.youPay == null) return have > 0 ? toSell() : { do: "stop", reason: `${buyAt} does not sell ${good}` };
  const target = w.quote(sellAt, good);
  if (!target || target.youGet == null) return have > 0 ? toSell() : { do: "stop", reason: `no known ${good} price at ${sellAt}; send a ship there first` };
  const margin = target.youGet - q.youPay;
  const floor = spec.minMarginPerUnit ?? defaultMarginFloor(q.youPay);
  if (margin < floor) {
    return have > 0 ? toSell() : { do: "stop", reason: `margin ${margin}/unit (${buyAt} ${q.youPay} → ${sellAt} ${target.youGet}) is below the ${floor} floor` };
  }
  const room = free(ship);
  if (room <= 0) return have > 0 ? toSell() : { do: "stop", reason: `hold is full of other cargo` };
  const affordable = w.credits == null ? room : Math.floor((w.credits - w.minCredits) / q.youPay);
  const units = Math.min(room, Math.max(1, q.tradeVolume), affordable);
  if (units <= 0) {
    return have > 0 ? toSell() : { do: "wait", ms: 60_000, phase: `waiting for credits (need ${q.youPay}/unit above the ${w.minCredits} floor)` };
  }
  return { do: "buy", good, units, phase: `buying ${good} at ${q.youPay} (margin ${margin})` };
}

/** Hold counts as full when less than 10% (min 2 units) is free. */
export function holdFull(ship: ShipView): boolean {
  return free(ship) < Math.max(2, Math.ceil(ship.cargo.capacity * 0.1));
}

/**
 * Where to mine: the assigned asteroid, unless it was recently seen over-mined
 * (STRIPPED, CRITICAL_LIMIT, UNSTABLE); then the nearest one in the same
 * system that shares a deposit type and isn't. Null when every candidate is
 * over-mined. Stateless, so once the assigned asteroid's mark wears off the
 * routine goes back and the next extraction reports its current state.
 */
export function mineSite(asteroid: string, w: World): { site: string; movedFrom?: string } | null {
  const all = w.asteroids?.(systemOf(asteroid)) ?? [];
  const home = all.find(a => a.symbol === asteroid);
  if (!home?.depleted) return { site: asteroid };
  const origin = w.map.point(asteroid);
  const dist = (sym: string) => {
    const p = w.map.point(sym);
    return origin && p ? Math.hypot(p.x - origin.x, p.y - origin.y) : Infinity;
  };
  const alt = all
    .filter(a => a.symbol !== asteroid && !a.depleted && (!home.deposits.length || a.deposits.some(d => home.deposits.includes(d))))
    .sort((a, b) => dist(a.symbol) - dist(b.symbol))[0];
  return alt ? { site: alt.symbol, movedFrom: asteroid } : null;
}

export function decideMine(spec: Extract<RoutineSpec, { kind: "mine" }>, ship: ShipView, w: World): Step {
  const contractGoods = spec.deliverContract ? w.contractNeeds.filter(n => n.remaining > 0) : [];
  const keepForContract = contractGoods.map(n => n.good);

  // Keep list: anything else extracted goes overboard straight away.
  if (spec.keep) {
    const junk = ship.cargo.inventory.find(i => i.units > 0 && !spec.keep!.includes(i.symbol) && !keepForContract.includes(i.symbol));
    if (junk && ship.waypoint !== spec.sellAt) return { do: "jettison", good: junk.symbol, units: junk.units, phase: `dumping ${junk.symbol}` };
  }

  if (holdFull(ship)) {
    const need = contractGoods.find(n => qty(ship, n.good) > 0);
    if (need) {
      const step = travelStep(ship, need.destination, w.map);
      if (step) return { ...step, ...(step.do === "navigate" ? { phase: `delivering ${need.good} to ${need.destination}` } : {}) } as Step;
      return { do: "deliver", contractId: need.contractId, good: need.good, units: Math.min(qty(ship, need.good), need.remaining), phase: `delivering ${need.good}` };
    }
    if (!spec.sellAt) return { do: "stop", reason: "hold full and no sellAt given" };
    const step = travelStep(ship, spec.sellAt, w.map);
    if (step) return step;
    const sellable = ship.cargo.inventory.filter(i => i.units > 0 && !keepForContract.includes(i.symbol) && buys(w.quote(spec.sellAt!, i.symbol)));
    const known = ship.cargo.inventory.some(i => w.quote(spec.sellAt!, i.symbol));
    if (!sellable.length && known) {
      return { do: "stop", reason: `hold full of goods ${spec.sellAt} doesn't buy: ${ship.cargo.inventory.map(i => `${i.units} ${i.symbol}`).join(", ")}` };
    }
    return { do: "sell_all", keep: keepForContract.length ? keepForContract : undefined, phase: `selling haul at ${spec.sellAt}` } as Step;
  }

  const where = mineSite(spec.asteroid, w);
  if (!where) return { do: "stop", reason: `${spec.asteroid} is over-mined and no other asteroid in ${systemOf(spec.asteroid)} with the same deposits is known to be clear` };
  const moved = where.movedFrom ? ` (moved off over-mined ${where.movedFrom})` : "";
  const go = travelStep(ship, where.site, w.map);
  if (go) return go.do === "navigate" ? { ...go, phase: `${go.phase}${moved}` } : go;
  if (ship.cooldownMs > 0) return { do: "wait", ms: ship.cooldownMs + 500, phase: `extraction cooldown` };
  return { do: "extract", phase: `mining at ${where.site}${moved} (${ship.cargo.units}/${ship.cargo.capacity})` };
}

/** Next market for a scout: never-priced first, then the stalest, skipping ones other scouts claimed. */
export function pickScoutTarget(ship: ShipView, candidates: { symbol: string; pricedAt: number | null }[], claimed: string[], now: number): string | null {
  const open = candidates.filter(c => c.symbol !== ship.waypoint && !claimed.includes(c.symbol) && (c.pricedAt == null || now - c.pricedAt > SCOUT_FRESH_MS));
  open.sort((a, b) => (a.pricedAt ?? 0) - (b.pricedAt ?? 0));
  return open[0]?.symbol ?? null;
}

export function decideScout(spec: Extract<RoutineSpec, { kind: "scout" }>, ship: ShipView, w: World, target: string | undefined): Step & { target?: string } {
  const markets = spec.waypoints?.length
    ? spec.waypoints.map(symbol => w.markets(systemOf(symbol)).find(m => m.symbol === symbol) ?? { symbol, pricedAt: null })
    : w.markets(ship.system);
  // Uncharted waypoints may hide a market or shipyard: scouts visit them too (charting reveals the traits and pays).
  const hidden = spec.waypoints?.length ? [] : (w.uncharted?.(ship.system) ?? []);
  const candidates = [...markets, ...hidden.filter(h => !markets.some(m => m.symbol === h)).map(symbol => ({ symbol, pricedAt: null }))];
  if (w.uncharted?.(ship.system).includes(ship.waypoint)) return { do: "chart", phase: `charting ${ship.waypoint}`, target: ship.waypoint };
  if (target && ship.waypoint !== target) {
    const step = travelStep(ship, target, w.map);
    if (step) return { ...step, target };
  }
  if (target && ship.waypoint === target) {
    const here = markets.find(c => c.symbol === target);
    if (here && (!here.pricedAt || w.now - here.pricedAt > QUOTE_FRESH_MS)) return { do: "read_market", waypoint: target, phase: `pricing ${target}`, target };
  }
  const next = pickScoutTarget(ship, candidates, w.claimed, w.now);
  if (!next) return { do: "wait", ms: 120_000, phase: "all markets priced recently" };
  const step = travelStep(ship, next, w.map);
  if (!step) return { do: "read_market", waypoint: next, phase: `pricing ${next}`, target: next };
  return { ...step, target: next };
}

export function decideGoto(spec: Extract<RoutineSpec, { kind: "goto" }>, ship: ShipView, w: World): Step {
  return travelStep(ship, spec.destination, w.map) ?? { do: "done", reason: `arrived at ${spec.destination}` };
}
