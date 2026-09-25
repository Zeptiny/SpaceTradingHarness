import { bus } from "../events/bus.js";
import { creditHistory } from "./credits.js";
import { loadJson, saveJsonAtomic } from "./persist.js";
import type { Agent, Contract, Ship, Waypoint } from "../generated/types.js";

interface Entry {
  value: unknown;
  fetchedAt: number;
}

// What the panel's System map and Markets page draw from. The agent's own
// stores keep their data across restarts but the map and markets views read
// the mirror, which started empty, and a system the atlas has already mapped
// is never listed again, so the map stayed blank after a restart.
// Fleet, agent and contracts are left out: the first wake re-reads them.
const SAVED_PREFIXES = ["system:", "system-waypoints:", "market:", "shipyard:"];
const SAVE_DELAY_MS = 15_000;

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
  private file: string | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  set<T>(key: string, value: T): T {
    this.map.set(key, { value, fetchedAt: Date.now() });
    this.sweep();
    if (SAVED_PREFIXES.some(p => key.startsWith(p))) this.scheduleSave();
    bus.emit({ type: "StateChanged", ts: Date.now(), keys: [key] });
    return value;
  }

  /** Loads the saved map/market entries from `file` (keeping their read times) and saves them there from now on. */
  restore(file: string): void {
    this.file = file;
    const saved = loadJson<Record<string, Entry>>(file, {});
    for (const [key, e] of Object.entries(saved)) {
      if (SAVED_PREFIXES.some(p => key.startsWith(p)) && e && typeof e.fetchedAt === "number" && !this.map.has(key)) {
        this.map.set(key, { value: e.value, fetchedAt: e.fetchedAt });
      }
    }
  }

  private scheduleSave(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
    this.saveTimer.unref?.();
  }

  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file) return;
    const out: Record<string, Entry> = {};
    for (const [key, e] of this.map) if (SAVED_PREFIXES.some(p => key.startsWith(p))) out[key] = e;
    try {
      saveJsonAtomic(this.file, out);
    } catch (err) {
      console.error("[mirror] save failed:", err instanceof Error ? err.message : err);
    }
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
    if (keys.some(k => SAVED_PREFIXES.some(p => k.startsWith(p)))) this.scheduleSave();
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
  shipyard: (s: string, w: string) => `shipyard:${s}:${w}`,
} as const;

// ---- Mirror write helpers (single write path per key) ----

export function observeAgent(agent: Agent | undefined): void {
  if (!agent) return;
  mirror.set(storeKeys.agent, agent);
  creditHistory.record(agent.credits);
}

// Writes a new array instead of editing the stored one: refreshFleet hands the
// same ships to the agent, and routines upsert while a wake is still reading
// them (an in-place swap once moved a ship out from under the wake-start scan).
export function upsertShip(ship: Ship): void {
  const ships = [...(mirror.get<FleetState>(storeKeys.fleet)?.ships ?? [])];
  const idx = ships.findIndex(s => s.symbol === ship.symbol);
  if (idx >= 0) ships[idx] = ship;
  else ships.push(ship);
  mirror.set(storeKeys.fleet, { ships });
}

export function removeShip(symbol: string): void {
  const fleet = mirror.get<FleetState>(storeKeys.fleet);
  if (!fleet) return;
  mirror.set(storeKeys.fleet, { ships: fleet.ships.filter(s => s.symbol !== symbol) });
}

export function upsertContract(contract: Contract): void {
  const contracts = [...(mirror.get<Contract[]>(storeKeys.contracts) ?? [])];
  const idx = contracts.findIndex(c => c.id === contract.id);
  if (idx >= 0) contracts[idx] = contract;
  else contracts.push(contract);
  mirror.set(storeKeys.contracts, contracts);
}

export function mergeSystemWaypoints(system: string, incoming: Waypoint[]): Waypoint[] {
  const existing = mirror.get<Waypoint[]>(storeKeys.systemWaypoints(system)) ?? [];
  const bySymbol = new Map(existing.map(w => [w.symbol, w]));
  for (const w of incoming) bySymbol.set(w.symbol, w);
  const merged = [...bySymbol.values()];
  mirror.set(storeKeys.systemWaypoints(system), merged);
  return merged;
}
