import { systemOf } from "./symbols.js";

/**
 * Pure route planning for goto and ship routines.
 *
 * Within a system: fewest-distance path from one waypoint to another whose
 * every leg fits the tank, stopping only at markets that sell fuel (where the
 * ship tops up to full). Falls back to DRIFT legs (1 fuel, slow) when no
 * CRUISE path exists. Across systems: a chain of jump gates over the gate
 * links the harness knows.
 */
export interface RoutePoint {
  symbol: string;
  x: number;
  y: number;
  /** Market here sells fuel. */
  fuel: boolean;
}

export interface Leg {
  to: string;
  mode: "CRUISE" | "DRIFT";
  distance: number;
  fuel: number;
}

// DRIFT is ~10× slower than CRUISE; weight it so it is only used when needed.
const DRIFT_WEIGHT = 10;

export function planRoute(opts: {
  from: RoutePoint;
  to: RoutePoint;
  stations: RoutePoint[];
  fuel: number;
  capacity: number;
  /** The ship tops up at `from` before leaving when it sells fuel. */
  refuelAtStart: boolean;
}): Leg[] | null {
  const { from, to } = opts;
  const dist = (a: RoutePoint, b: RoutePoint) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));
  if (from.symbol === to.symbol) return [];
  if (opts.capacity <= 0) return [{ to: to.symbol, mode: "CRUISE", distance: dist(from, to), fuel: 0 }];

  const nodes = [from, ...opts.stations.filter(s => s.fuel && s.symbol !== from.symbol && s.symbol !== to.symbol), to];
  const startFuel = opts.refuelAtStart && from.fuel ? opts.capacity : opts.fuel;
  const fuelAt = (i: number) => (i === 0 ? startFuel : opts.capacity);

  for (const allowDrift of [false, true]) {
    const best = new Array<number>(nodes.length).fill(Infinity);
    const prev = new Array<{ node: number; leg: Leg } | null>(nodes.length).fill(null);
    const done = new Array<boolean>(nodes.length).fill(false);
    best[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && best[i]! < Infinity && (u < 0 || best[i]! < best[u]!)) u = i;
      if (u < 0) break;
      done[u] = true;
      if (u === nodes.length - 1) break;
      for (let v = 1; v < nodes.length; v++) {
        if (v === u || done[v]) continue;
        const d = dist(nodes[u]!, nodes[v]!);
        let leg: Leg | null = null;
        let cost = Infinity;
        if (d <= fuelAt(u)) {
          leg = { to: nodes[v]!.symbol, mode: "CRUISE", distance: d, fuel: d };
          cost = d;
        } else if (allowDrift && fuelAt(u) >= 1) {
          leg = { to: nodes[v]!.symbol, mode: "DRIFT", distance: d, fuel: 1 };
          cost = d * DRIFT_WEIGHT;
        }
        if (leg && best[u]! + cost < best[v]!) {
          best[v] = best[u]! + cost;
          prev[v] = { node: u, leg };
        }
      }
    }
    const target = nodes.length - 1;
    if (best[target] === Infinity) continue;
    const legs: Leg[] = [];
    for (let at = target; prev[at]; at = prev[at]!.node) legs.unshift(prev[at]!.leg);
    return legs;
  }
  return null;
}

export interface GateLink {
  symbol: string;
  system: string;
  connections: string[];
}

/**
 * Gate waypoints to pass through, starting with the gate in `fromSystem` and
 * ending with the first gate reached in `toSystem`. Null when the known links
 * don't connect the two systems.
 */
export function planJumps(fromSystem: string, toSystem: string, gates: GateLink[]): string[] | null {
  const start = gates.find(g => g.system === fromSystem);
  if (!start) return null;
  const bySymbol = new Map(gates.map(g => [g.symbol, g]));
  const prev = new Map<string, string | null>([[start.symbol, null]]);
  const queue = [start.symbol];
  while (queue.length) {
    const cur = queue.shift()!;
    if (systemOf(cur) === toSystem) {
      const path: string[] = [];
      for (let at: string | null = cur; at; at = prev.get(at) ?? null) path.unshift(at);
      return path;
    }
    for (const next of bySymbol.get(cur)?.connections ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      queue.push(next);
    }
  }
  return null;
}
