import type { Construction, JumpGate, Market, System, Waypoint, WaypointModifier } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";
import { systemOf } from "../utils/symbols.js";

/**
 * Harness-local directory of the universe seen so far (like shipyards.ts for
 * ship offers). Waypoint positions and traits, system coordinates, jump-gate
 * links and what each market trades are static per reset, so remembering them
 * lets working memory show the agent where things are without re-discovering
 * them every wake. Only construction progress changes; it carries its own
 * fetch time.
 */
export interface KnownWaypoint {
  symbol: string;
  system: string;
  type: string;
  x: number;
  y: number;
  traits: string[];
  underConstruction?: boolean | undefined;
  /** Temporary conditions (STRIPPED, UNSTABLE, CRITICAL_LIMIT, RADIATION_LEAK, CIVIL_UNREST); they come and go. */
  modifiers?: string[] | undefined;
}

export interface KnownSystem {
  symbol: string;
  x: number;
  y: number;
  type: string;
  /** Waypoint count by type, from the system record (no traits). */
  waypointTypes: Record<string, number>;
  /** Every waypoint page read, so traits of all waypoints are known. */
  mapped: boolean;
  /** Next waypoint page to read while mapping. */
  nextPage: number;
  /** Shipyard and marketplace waypoints read by trait filter (cheaper than a full map). */
  scouted: boolean;
}

export interface KnownGate {
  symbol: string;
  system: string;
  connections: string[];
}

export interface KnownConstruction {
  materials: { good: string; fulfilled: number; required: number }[];
  isComplete: boolean;
  fetchedAt: number;
}

export interface KnownMarket {
  exports: string[];
  imports: string[];
  exchange: string[];
}

export interface AtlasData {
  waypoints: Record<string, KnownWaypoint>;
  systems: Record<string, KnownSystem>;
  gates: Record<string, KnownGate>;
  construction: Record<string, KnownConstruction>;
  markets: Record<string, KnownMarket>;
}

/** Traits worth surfacing to the agent; the rest are flavor. */
const USEFUL_TRAITS = new Set([
  "MARKETPLACE", "SHIPYARD", "COMMON_METAL_DEPOSITS", "PRECIOUS_METAL_DEPOSITS", "RARE_METAL_DEPOSITS",
  "MINERAL_DEPOSITS", "EXPLOSIVE_GASES", "ICE_CRYSTALS", "STRIPPED", "UNSTABLE_COMPOSITION",
]);

/** Drops flavor traits (see USEFUL_TRAITS) so waypoint lists stay compact. */
export function usefulTraits(traits: string[]): string[] {
  return traits.filter(t => USEFUL_TRAITS.has(t));
}

const emptyData = (): AtlasData => ({ waypoints: {}, systems: {}, gates: {}, construction: {}, markets: {} });

/** Accepts the current file shape and the older flat waypoint directory. */
function migrate(raw: unknown): AtlasData {
  if (!raw || typeof raw !== "object") return emptyData();
  const r = raw as Partial<AtlasData>;
  if (r.waypoints && typeof r.waypoints === "object") {
    return { ...emptyData(), ...r } as AtlasData;
  }
  return { ...emptyData(), waypoints: raw as Record<string, KnownWaypoint> };
}

export type MapEntry = {
  symbol: string;
  type: string;
  x: number;
  y: number;
  traits: string[];
  modifiers?: string[];
  exports?: string[];
  imports?: string[];
  exchange?: string[];
};

export interface GateConnection {
  system: string;
  gate: string;
  distance: number | null;
  /** Null until the harness has scouted that system. */
  shipyards: string[] | null;
  marketplaces: number | null;
  asteroids: number | null;
}

export interface GateSummary {
  system: string;
  gate: string;
  underConstruction: boolean | null;
  construction?: string | undefined;
  connections: GateConnection[] | null;
}

/**
 * Pure: the jump-gate view of the given systems. Connections nearest first,
 * capped, with what the harness knows about each neighbor.
 */
export function summarizeGates(data: AtlasData, systems: string[], maxConnections = 12): GateSummary[] {
  const out: GateSummary[] = [];
  for (const system of systems) {
    const gateWp = Object.values(data.waypoints).find(w => w.system === system && w.type === "JUMP_GATE");
    if (!gateWp) continue;
    const gate = data.gates[gateWp.symbol];
    const here = data.systems[system];
    const cons = data.construction[gateWp.symbol];
    const connections = gate
      ? gate.connections.map(conn => {
          const neighbor = data.systems[systemOf(conn)];
          const inNeighbor = Object.values(data.waypoints).filter(w => w.system === neighbor?.symbol);
          return {
            system: systemOf(conn),
            gate: conn,
            distance: here && neighbor ? Math.round(Math.hypot(here.x - neighbor.x, here.y - neighbor.y)) : null,
            shipyards: neighbor?.scouted || neighbor?.mapped
              ? inNeighbor.filter(w => w.traits.includes("SHIPYARD")).map(w => w.symbol)
              : null,
            marketplaces: neighbor?.scouted || neighbor?.mapped
              ? inNeighbor.filter(w => w.traits.includes("MARKETPLACE")).length
              : null,
            asteroids: neighbor
              ? Object.entries(neighbor.waypointTypes).filter(([t]) => t.includes("ASTEROID")).reduce((n, [, c]) => n + c, 0)
              : null,
          };
        })
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
        .slice(0, maxConnections)
      : null;
    out.push({
      system,
      gate: gateWp.symbol,
      underConstruction: gateWp.underConstruction ?? null,
      construction: cons && !cons.isComplete
        ? cons.materials.map(m => `${m.good} ${m.fulfilled}/${m.required}`).join(", ")
        : undefined,
      connections,
    });
  }
  return out;
}

class Atlas {
  private data: AtlasData;
  private file = dataFile("atlas.json");

  constructor() {
    this.data = migrate(loadJson<unknown>(this.file, {}));
  }

  private persist(): void {
    saveJsonAtomic(this.file, this.data);
  }

  record(waypoints: Waypoint[]): void {
    let changed = false;
    for (const w of waypoints) {
      const traits = (w.traits ?? []).map(t => t.symbol);
      // Scanned-from-afar waypoints can arrive with no traits (UNCHARTED); never
      // let them erase traits we already know.
      const prev = this.data.waypoints[w.symbol];
      const next: KnownWaypoint = {
        symbol: w.symbol,
        system: w.systemSymbol,
        type: w.type,
        x: w.x,
        y: w.y,
        traits: traits.length ? traits : prev?.traits ?? [],
        underConstruction: typeof w.isUnderConstruction === "boolean" ? w.isUnderConstruction : prev?.underConstruction,
        // Modifiers are only trusted from a full record (one with traits); scans from afar leave the known ones.
        modifiers: traits.length && w.modifiers ? w.modifiers.map(m => m.symbol) : prev?.modifiers,
      };
      if (!next.modifiers?.length) delete next.modifiers;
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        this.data.waypoints[w.symbol] = next;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  /** Modifiers reported by an extraction at the waypoint (the extract response carries them). */
  recordModifiers(symbol: string, modifiers: WaypointModifier[]): void {
    const w = this.data.waypoints[symbol];
    if (!w) return;
    const next = modifiers.map(m => m.symbol);
    if (JSON.stringify(w.modifiers ?? []) === JSON.stringify(next)) return;
    if (next.length) w.modifiers = next;
    else delete w.modifiers;
    this.persist();
  }

  recordSystem(s: System): void {
    const prev = this.data.systems[s.symbol];
    const waypointTypes: Record<string, number> = {};
    for (const w of s.waypoints ?? []) waypointTypes[w.type] = (waypointTypes[w.type] ?? 0) + 1;
    this.data.systems[s.symbol] = {
      symbol: s.symbol,
      x: s.x,
      y: s.y,
      type: s.type,
      waypointTypes,
      mapped: prev?.mapped ?? false,
      nextPage: prev?.nextPage ?? 1,
      scouted: prev?.scouted ?? false,
    };
    this.persist();
  }

  /** Mapping progress for a system whose record is known. */
  markMapPage(system: string, page: number, done: boolean): void {
    const s = this.data.systems[system];
    if (!s) return;
    s.nextPage = page + 1;
    if (done) s.mapped = true;
    this.persist();
  }

  markScouted(system: string): void {
    const s = this.data.systems[system];
    if (!s) return;
    s.scouted = true;
    this.persist();
  }

  recordGate(gate: JumpGate, system: string): void {
    this.data.gates[gate.symbol] = { symbol: gate.symbol, system, connections: [...(gate.connections ?? [])] };
    this.persist();
  }

  recordConstruction(c: Construction): void {
    this.data.construction[c.symbol] = {
      materials: (c.materials ?? []).map(m => ({ good: m.tradeSymbol, fulfilled: m.fulfilled, required: m.required })),
      isComplete: c.isComplete,
      fetchedAt: Date.now(),
    };
    const wp = this.data.waypoints[c.symbol];
    if (wp && c.isComplete) wp.underConstruction = false;
    this.persist();
  }

  recordMarket(m: Market): void {
    const next: KnownMarket = {
      exports: (m.exports ?? []).map(g => g.symbol),
      imports: (m.imports ?? []).map(g => g.symbol),
      exchange: (m.exchange ?? []).map(g => g.symbol),
    };
    if (JSON.stringify(this.data.markets[m.symbol]) === JSON.stringify(next)) return;
    this.data.markets[m.symbol] = next;
    this.persist();
  }

  get(symbol: string): KnownWaypoint | undefined {
    return this.data.waypoints[symbol];
  }

  system(symbol: string): KnownSystem | undefined {
    return this.data.systems[symbol];
  }

  gate(symbol: string): KnownGate | undefined {
    return this.data.gates[symbol];
  }

  construction(symbol: string): KnownConstruction | undefined {
    return this.data.construction[symbol];
  }

  market(symbol: string): KnownMarket | undefined {
    return this.data.markets[symbol];
  }

  /** True when the waypoint's market is known to sell FUEL (export or exchange). */
  sellsFuel(symbol: string): boolean {
    const m = this.data.markets[symbol];
    return !!m && (m.exchange.includes("FUEL") || m.exports.includes("FUEL"));
  }

  /** Every known gate record (all systems). */
  allGates(): KnownGate[] {
    return Object.values(this.data.gates);
  }

  inSystem(system: string): KnownWaypoint[] {
    return Object.values(this.data.waypoints).filter(w => w.system === system);
  }

  distance(a: string, b: string): number | null {
    const wa = this.data.waypoints[a];
    const wb = this.data.waypoints[b];
    if (!wa || !wb || wa.system !== wb.system) return null;
    return Math.round(Math.hypot(wa.x - wb.x, wa.y - wb.y));
  }

  /** Compact map of the given systems: only waypoints with a useful trait or an asteroid/gas type, markets with what they trade. */
  summary(systems: string[]): { system: string; mapped: boolean; waypoints: MapEntry[] }[] {
    return systems.map(system => ({
      system,
      mapped: this.data.systems[system]?.mapped ?? false,
      waypoints: this.inSystem(system)
        .map(w => ({ ...w, traits: w.traits.filter(t => USEFUL_TRAITS.has(t)) }))
        .filter(w => w.traits.length || /ASTEROID|GAS_GIANT/.test(w.type))
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map(({ symbol, type, x, y, traits, modifiers }) => {
          const entry: MapEntry = { symbol, type, x, y, traits };
          if (modifiers?.length) entry.modifiers = modifiers;
          const m = this.data.markets[symbol];
          if (m?.exports.length) entry.exports = m.exports;
          if (m?.imports.length) entry.imports = m.imports;
          if (m?.exchange.length) entry.exchange = m.exchange;
          return entry;
        }),
    }));
  }

  gates(systems: string[]): GateSummary[] {
    return summarizeGates(this.data, systems);
  }
}

export const atlas = new Atlas();
