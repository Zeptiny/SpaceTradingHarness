import type { System } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * Every system in the universe (position, star type, waypoint count), for the
 * panel's galaxy map only: the agent never sees it. Systems are fixed for a
 * whole reset, so the list is fetched once and kept on disk. It comes from the
 * bulk `/systems.json` dump when the server offers one (a single request),
 * otherwise from `GET /systems` pages spent by the background collector while
 * the agent sleeps.
 */

/** [symbol, x, y, star type, waypoint count, factions joined by ","] */
export type GalaxyRow = [string, number, number, string, number, string];

export interface GalaxyData {
  systems: Record<string, GalaxyRow>;
  /** Every system is known. */
  complete: boolean;
  /** Next `GET /systems` page to read while paging. */
  nextPage: number;
  /** Server's system count (meta.total), once a page has been read. */
  total: number | null;
  source: "dump" | "pages" | null;
  /** Last time the bulk dump was tried and failed; retried after DUMP_RETRY_MS. */
  dumpFailedAt: number | null;
  updatedAt: number;
}

export const PAGE_SIZE = 20;
export const DUMP_RETRY_MS = 24 * 3600_000;

const emptyData = (): GalaxyData => ({
  systems: {}, complete: false, nextPage: 1, total: null, source: null, dumpFailedAt: null, updatedAt: 0,
});

export interface RowSource {
  symbol: string;
  x: number;
  y: number;
  type: string;
  waypoints?: unknown[] | undefined;
  factions?: { symbol: string }[] | undefined;
}

export function toRow(s: RowSource, waypointCount = s.waypoints?.length ?? 0): GalaxyRow {
  return [s.symbol, s.x, s.y, s.type, waypointCount, (s.factions ?? []).map(f => f.symbol).join(",")];
}

/** Pure: what one `GET /systems` page does to the cache. */
export function applyPage(data: GalaxyData, page: number, systems: System[], total: number | undefined): GalaxyData {
  // A different total mid-way means the universe changed under us (a reset): start over.
  const restart = total !== undefined && data.total !== null && total !== data.total;
  const base = restart ? { ...emptyData(), dumpFailedAt: data.dumpFailedAt } : data;
  const next: GalaxyData = { ...base, systems: { ...base.systems }, source: "pages", updatedAt: Date.now() };
  if (restart) return { ...next, total: total ?? null };
  for (const s of systems) next.systems[s.symbol] = toRow(s);
  next.total = total ?? next.total;
  next.complete = systems.length < PAGE_SIZE || (next.total !== null && page * PAGE_SIZE >= next.total);
  next.nextPage = next.complete ? page : page + 1;
  return next;
}

/**
 * Pure: a finished galaxy that lacks a system the fleet is in belongs to an
 * earlier reset (system symbols change every reset) and must be refetched.
 */
export function isStale(data: GalaxyData, fleetSystems: string[]): boolean {
  return data.complete && fleetSystems.some(s => !data.systems[s]);
}

class Galaxy {
  private data: GalaxyData;
  private file = dataFile("galaxy.json");

  constructor() {
    this.data = { ...emptyData(), ...loadJson<Partial<GalaxyData>>(this.file, {}) };
  }

  private persist(): void {
    saveJsonAtomic(this.file, this.data);
  }

  get complete(): boolean {
    return this.data.complete;
  }
  get nextPage(): number {
    return this.data.nextPage;
  }

  /** The bulk dump is worth trying: never tried, or the last failure is old. */
  dumpDue(now = Date.now()): boolean {
    return !this.data.complete && this.data.source !== "pages"
      && (this.data.dumpFailedAt === null || now - this.data.dumpFailedAt > DUMP_RETRY_MS);
  }

  recordDump(systems: System[]): void {
    this.data = {
      ...emptyData(),
      systems: Object.fromEntries(systems.map(s => [s.symbol, toRow(s)])),
      complete: true,
      total: systems.length,
      source: "dump",
      updatedAt: Date.now(),
    };
    this.persist();
  }

  dumpFailed(): void {
    this.data.dumpFailedAt = Date.now();
    this.persist();
  }

  recordPage(page: number, systems: System[], total: number | undefined): void {
    this.data = applyPage(this.data, page, systems, total);
    this.persist();
  }

  /** Drops a galaxy left over from an earlier reset. Returns true if it did. */
  resetIfStale(fleetSystems: string[]): boolean {
    if (!isStale(this.data, fleetSystems)) return false;
    this.data = emptyData();
    this.persist();
    return true;
  }

  rows(): GalaxyRow[] {
    return Object.values(this.data.systems);
  }

  status() {
    return {
      count: Object.keys(this.data.systems).length,
      total: this.data.total,
      complete: this.data.complete,
      source: this.data.source,
      updatedAt: this.data.updatedAt,
    };
  }
}

export const galaxy = new Galaxy();
