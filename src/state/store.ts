import { bus } from "../events/bus.js";
import type { Ship, Waypoint } from "../generated/types.js";

interface Entry {
  value: unknown;
  fetchedAt: number;
}

export interface FleetState {
  ships: Ship[];
}

/**
 * Panel-only state mirror.
 *
 * API responses are written here so the web panel can visualize them, but it
 * is NEVER read to answer the agent: tools, guards, and working memory always
 * fetch fresh data from the API. Nothing in the agent path may call get().
 */
class StateMirror {
  private map = new Map<string, Entry>();

  set<T>(key: string, value: T): T {
    this.map.set(key, { value, fetchedAt: Date.now() });
    this.sweep();
    bus.emit({ type: "StateChanged", ts: Date.now(), keys: [key] });
    return value;
  }

  get<T>(key: string): T | undefined {
    return this.map.get(key)?.value as T | undefined;
  }

  age(key: string): number | null {
    const e = this.map.get(key);
    return e ? Date.now() - e.fetchedAt : null;
  }

  invalidate(prefix: string): void {
    const keys = [...this.map.keys()].filter(k => k.startsWith(prefix));
    for (const k of keys) this.map.delete(k);
    if (keys.length) bus.emit({ type: "StateChanged", ts: Date.now(), keys });
  }

  listPrefix<T>(prefix: string): { key: string; value: T; fetchedAt: number }[] {
    const out: { key: string; value: T; fetchedAt: number }[] = [];
    for (const [key, e] of this.map) {
      if (key.startsWith(prefix)) out.push({ key, value: e.value as T, fetchedAt: e.fetchedAt });
    }
    return out;
  }

  private sweep(): void {
    if (this.map.size < 800) return;
    const entries = [...this.map.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    for (let i = 0; i < entries.length - 600; i++) this.map.delete(entries[i]![0]);
  }
}

export const mirror = new StateMirror();

export const storeKeys = {
  agent: "agent",
  fleet: "fleet",
  contracts: "contracts",
  system: (s: string) => `system:${s}`,
  systemWaypoints: (s: string) => `system-waypoints:${s}`,
  waypoint: (s: string, w: string) => `waypoint:${s}:${w}`,
  market: (s: string, w: string) => `market:${s}:${w}`,
} as const;

// ---- Mirror write helpers (single write path per key) ----

export function upsertShip(ship: Ship): void {
  const fleet = mirror.get<FleetState>(storeKeys.fleet) ?? { ships: [] };
  const idx = fleet.ships.findIndex(s => s.symbol === ship.symbol);
  if (idx >= 0) fleet.ships[idx] = ship;
  else fleet.ships.push(ship);
  mirror.set(storeKeys.fleet, fleet);
}

export function mergeSystemWaypoints(system: string, incoming: Waypoint[]): Waypoint[] {
  const existing = mirror.get<Waypoint[]>(storeKeys.systemWaypoints(system)) ?? [];
  const bySymbol = new Map(existing.map(w => [w.symbol, w]));
  for (const w of incoming) bySymbol.set(w.symbol, w);
  const merged = [...bySymbol.values()];
  mirror.set(storeKeys.systemWaypoints(system), merged);
  return merged;
}
