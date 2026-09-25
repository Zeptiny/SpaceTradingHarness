import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * What each ship would fetch if scrapped (GET /my/ships/{ship}/scrap). The
 * quote needs the ship docked at a shipyard, so the collector reads it when a
 * ship happens to sit at one, and a quote for one ship stands in (marked
 * estimated) for others with the same frame until they get their own.
 * Figures only: nothing here tells the agent to sell ships.
 */
export interface ResaleQuote {
  ship: string;
  frame: string;
  value: number;
  waypoint: string;
  ts: number;
}

export interface ResaleView {
  value: number;
  estimated: boolean;
  seenMinutesAgo: number;
}

export const RESALE_MAX_AGE_MS = 6 * 3600_000;

/** Pure: the ship's own quote, else the newest quote for a ship with the same frame. */
export function resaleFor(quotes: ResaleQuote[], ship: string, frame: string | undefined, now: number): ResaleView | null {
  const own = quotes.find(q => q.ship === ship);
  const q = own ?? quotes.filter(x => frame && x.frame === frame).sort((a, b) => b.ts - a.ts)[0];
  if (!q) return null;
  return { value: q.value, estimated: !own, seenMinutesAgo: Math.round((now - q.ts) / 60_000) };
}

class Resale {
  private quotes: Record<string, ResaleQuote>;
  private file = dataFile("resale.json");

  constructor() {
    this.quotes = loadJson<Record<string, ResaleQuote>>(this.file, {});
  }

  record(q: ResaleQuote): void {
    this.quotes[q.ship] = q;
    saveJsonAtomic(this.file, this.quotes);
  }

  seenAt(ship: string): number | undefined {
    return this.quotes[ship]?.ts;
  }

  lookup(ship: string, frame: string | undefined, now = Date.now()): ResaleView | null {
    return resaleFor(Object.values(this.quotes), ship, frame, now);
  }

  /** Forget ships that no longer exist (scrapped or sold). */
  prune(ships: string[]): void {
    const keep = new Set(ships);
    const before = Object.keys(this.quotes).length;
    for (const s of Object.keys(this.quotes)) if (!keep.has(s)) delete this.quotes[s];
    if (Object.keys(this.quotes).length !== before) saveJsonAtomic(this.file, this.quotes);
  }
}

export const resale = new Resale();
