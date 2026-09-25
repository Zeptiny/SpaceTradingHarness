import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * Per-ship money ledger: every credit a ship's own actions earned or spent
 * (trade, fuel, contract payouts it triggered) plus what the ship cost. The
 * account-wide ledger (ledger.ts) says whether the fleet earns; this says
 * which ships do. Figures only — nothing here tells the agent what to buy.
 */
export type EarningKind = "trade" | "fuel" | "contract" | "other";

export interface EarningEvent {
  ts: number;
  ship: string;
  amount: number;
  kind: EarningKind;
}

interface ShipMeta {
  /** Purchase price, when the harness saw the purchase. */
  boughtFor?: number | undefined;
  /** When tracking started for this ship (purchase or first event). */
  since: number;
}

interface EarningsFile {
  events: EarningEvent[];
  ships: Record<string, ShipMeta>;
}

export interface ShipEarnings {
  ship: string;
  boughtFor: number | null;
  lastHour: number;
  last24h: number;
  total: number;
  trackedHours: number;
  /** total / trackedHours, once at least 15 minutes are tracked. */
  perHour: number | null;
  /** boughtFor / perHour, when both are known and perHour is positive. */
  paybackHours: number | null;
  byKind: Partial<Record<EarningKind, number>>;
}

const KEEP_MS = 7 * 24 * 3600_000;
const MAX_EVENTS = 20_000;
const HOUR = 3600_000;

/** Pure: per-ship totals over the given events, one row per ship in `ships` (plus any other ship with events). */
export function summarizeEarnings(
  events: EarningEvent[],
  meta: Record<string, ShipMeta>,
  ships: string[],
  now = Date.now(),
): ShipEarnings[] {
  const symbols = [...new Set([...ships, ...events.map(e => e.ship)])];
  return symbols.map(ship => {
    const mine = events.filter(e => e.ship === ship);
    const sum = (from: number) => mine.filter(e => e.ts >= from).reduce((n, e) => n + e.amount, 0);
    const since = meta[ship]?.since ?? mine[0]?.ts ?? now;
    const trackedHours = Math.max(0, (now - since) / HOUR);
    const total = sum(0);
    const perHour = trackedHours >= 0.25 ? Math.round(total / trackedHours) : null;
    const boughtFor = meta[ship]?.boughtFor ?? null;
    const byKind: Partial<Record<EarningKind, number>> = {};
    for (const e of mine) byKind[e.kind] = (byKind[e.kind] ?? 0) + e.amount;
    return {
      ship,
      boughtFor,
      lastHour: sum(now - HOUR),
      last24h: sum(now - 24 * HOUR),
      total,
      trackedHours: Math.round(trackedHours * 10) / 10,
      perHour,
      paybackHours: boughtFor !== null && perHour !== null && perHour > 0 ? Math.round((boughtFor / perHour) * 10) / 10 : null,
      byKind,
    };
  });
}

class Earnings {
  private data: EarningsFile;
  private file = dataFile("earnings.json");

  constructor() {
    const loaded = loadJson<Partial<EarningsFile>>(this.file, {});
    this.data = { events: loaded.events ?? [], ships: loaded.ships ?? {} };
  }

  private persist(): void {
    const cutoff = Date.now() - KEEP_MS;
    this.data.events = this.data.events.filter(e => e.ts >= cutoff).slice(-MAX_EVENTS);
    saveJsonAtomic(this.file, this.data);
  }

  record(ship: string, amount: number, kind: EarningKind): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    const ts = Date.now();
    this.data.ships[ship] ??= { since: ts };
    this.data.events.push({ ts, ship, amount: Math.round(amount), kind });
    this.persist();
  }

  recordPurchase(ship: string, price: number): void {
    this.data.ships[ship] = { boughtFor: price, since: Date.now() };
    this.persist();
  }

  /** Starts tracking ships the harness has not seen trade yet, so their hours count from now. */
  track(ships: string[]): void {
    let changed = false;
    for (const s of ships) {
      if (!this.data.ships[s]) {
        this.data.ships[s] = { since: Date.now() };
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  summary(ships: string[]): ShipEarnings[] {
    return summarizeEarnings(this.data.events, this.data.ships, ships);
  }
}

export const earnings = new Earnings();
