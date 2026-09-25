import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * Harness-local record of credits and fleet size over time, plus money spent
 * on ships. The API only reports the current balance, so without this the
 * agent cannot tell whether it is actually earning or how fast.
 */
export interface LedgerSample {
  ts: number;
  credits: number;
  fleetSize: number;
}

export interface ShipSpend {
  ts: number;
  price: number;
}

interface LedgerFile {
  samples: LedgerSample[];
  shipSpend: ShipSpend[];
}

export interface Trend {
  windowHours: number;
  creditsDelta: number;
  shipSpend: number;
  /** creditsDelta + ship spend: money earned, counting ships bought as kept value. */
  earned: number;
  earnedPerHour: number;
  fleetDelta: number;
}

const KEEP_MS = 7 * 24 * 3600_000;
const MIN_SAMPLE_GAP_MS = 60_000;

/** Pure: trend over the last `windowMs` from the given samples and ship spend. */
export function computeTrend(samples: LedgerSample[], spend: ShipSpend[], windowMs: number, now = Date.now()): Trend | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  const start = samples.find(s => s.ts >= now - windowMs);
  if (!start || start === last) return null;
  const hours = (last.ts - start.ts) / 3600_000;
  if (hours <= 0) return null;
  const shipSpend = spend.filter(s => s.ts > start.ts && s.ts <= last.ts).reduce((n, s) => n + s.price, 0);
  const creditsDelta = last.credits - start.credits;
  const earned = creditsDelta + shipSpend;
  return {
    windowHours: Math.round(hours * 10) / 10,
    creditsDelta,
    shipSpend,
    earned,
    earnedPerHour: Math.round(earned / hours),
    fleetDelta: last.fleetSize - start.fleetSize,
  };
}

class Ledger {
  private data: LedgerFile;
  private file = dataFile("ledger.json");

  constructor() {
    const loaded = loadJson<Partial<LedgerFile>>(this.file, {});
    this.data = { samples: loaded.samples ?? [], shipSpend: loaded.shipSpend ?? [] };
  }

  private persist(): void {
    const cutoff = Date.now() - KEEP_MS;
    this.data.samples = this.data.samples.filter(s => s.ts >= cutoff);
    this.data.shipSpend = this.data.shipSpend.filter(s => s.ts >= cutoff);
    saveJsonAtomic(this.file, this.data);
  }

  sample(credits: number, fleetSize: number): void {
    const last = this.data.samples[this.data.samples.length - 1];
    const ts = Date.now();
    // Wakes can come seconds apart; replace a very recent sample instead of piling them up.
    if (last && ts - last.ts < MIN_SAMPLE_GAP_MS) this.data.samples.pop();
    this.data.samples.push({ ts, credits, fleetSize });
    this.persist();
  }

  recordShipPurchase(price: number): void {
    this.data.shipSpend.push({ ts: Date.now(), price });
    this.persist();
  }

  trend(windowMs: number): Trend | null {
    return computeTrend(this.data.samples, this.data.shipSpend, windowMs);
  }
}

export const ledger = new Ledger();
