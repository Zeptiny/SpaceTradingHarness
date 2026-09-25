import type { Waypoint } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * Harness-local directory of waypoints seen (like shipyards.ts for ship
 * offers). Waypoint positions and traits are static per reset, so remembering
 * them lets working memory show the agent where markets, shipyards and
 * asteroids are without re-discovering them every wake.
 */
export interface KnownWaypoint {
  symbol: string;
  system: string;
  type: string;
  x: number;
  y: number;
  traits: string[];
}

type Directory = Record<string, KnownWaypoint>;

/** Traits worth surfacing to the agent; the rest are flavor. */
const USEFUL_TRAITS = new Set([
  "MARKETPLACE", "SHIPYARD", "COMMON_METAL_DEPOSITS", "PRECIOUS_METAL_DEPOSITS", "RARE_METAL_DEPOSITS",
  "MINERAL_DEPOSITS", "EXPLOSIVE_GASES", "ICE_CRYSTALS", "STRIPPED", "UNSTABLE_COMPOSITION",
]);

class Atlas {
  private dir: Directory = {};
  private file = dataFile("atlas.json");

  constructor() {
    this.dir = loadJson<Directory>(this.file, {});
  }

  record(waypoints: Waypoint[]): void {
    let changed = false;
    for (const w of waypoints) {
      const traits = (w.traits ?? []).map(t => t.symbol);
      // Scanned-from-afar waypoints can arrive with no traits (UNCHARTED); never
      // let them erase traits we already know.
      const prev = this.dir[w.symbol];
      const next: KnownWaypoint = {
        symbol: w.symbol,
        system: w.systemSymbol,
        type: w.type,
        x: w.x,
        y: w.y,
        traits: traits.length ? traits : prev?.traits ?? [],
      };
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        this.dir[w.symbol] = next;
        changed = true;
      }
    }
    if (changed) saveJsonAtomic(this.file, this.dir);
  }

  get(symbol: string): KnownWaypoint | undefined {
    return this.dir[symbol];
  }

  inSystem(system: string): KnownWaypoint[] {
    return Object.values(this.dir).filter(w => w.system === system);
  }

  distance(a: string, b: string): number | null {
    const wa = this.dir[a];
    const wb = this.dir[b];
    if (!wa || !wb || wa.system !== wb.system) return null;
    return Math.round(Math.hypot(wa.x - wb.x, wa.y - wb.y));
  }

  /** Compact map of the given systems: only waypoints with a useful trait or an asteroid/gas type. */
  summary(systems: string[]): { system: string; waypoints: { symbol: string; type: string; x: number; y: number; traits: string[] }[] }[] {
    return systems.map(system => ({
      system,
      waypoints: this.inSystem(system)
        .map(w => ({ ...w, traits: w.traits.filter(t => USEFUL_TRAITS.has(t)) }))
        .filter(w => w.traits.length || /ASTEROID|GAS_GIANT/.test(w.type))
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map(({ symbol, type, x, y, traits }) => ({ symbol, type, x, y, traits })),
    }));
  }
}

export const atlas = new Atlas();
