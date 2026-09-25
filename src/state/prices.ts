import type { Market, MarketTransaction } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

export interface PricePoint {
  waypoint: string;
  good: string;
  purchasePrice: number | null;
  sellPrice: number | null;
  volume: number | null;
  type?: string | undefined; // EXPORT | IMPORT | EXCHANGE (absent on points recorded before this field existed)
  supply?: string | undefined;
  activity?: string | undefined;
  ts: number;
}

/** A trade some ship made at a market, from the market's recent-transactions list. */
export interface SeenTrade {
  ship: string;
  type: "PURCHASE" | "SELL";
  units: number;
  ts: number;
}

/** youPay: what buyAt charges per unit; youGet: what sellAt pays per unit. */
export interface TradeLead {
  good: string;
  buyAt: string;
  youPay: number;
  sellAt: string;
  youGet: number;
  marginPerUnit: number;
  unitsPerTrade: number; // min tradeVolume of both ends — what one buy/sell call moves without moving the price much
  profitPerTrade: number;
  distance: number | null;
  ageMinutes: number; // age of the older of the two price observations
  /** Supply at buyAt: SCARCE/LIMITED means the price climbs fast as you buy. */
  buySupply?: string | undefined;
  /** Supply at sellAt: HIGH/ABUNDANT means the market is already well stocked and pays less as you sell. */
  sellSupply?: string | undefined;
  /** Units other agents bought at buyAt plus sold at sellAt in the last hour (only counted where a ship saw the market). */
  othersTradedLastHour?: number | undefined;
  /** % change of youPay at buyAt over about the last hour (rising = the source is drying up). */
  youPayChange1hPct?: number | undefined;
  /** % change of youGet at sellAt over about the last hour (falling = the sink is filling up). */
  youGetChange1hPct?: number | undefined;
}

type History = Record<string, PricePoint[]>;

const PER_KEY = 60;
const TRADE_LOG_MS = 2 * 3600_000;

class PriceHistory {
  private history: History = {};
  /**
   * Recent trades by any agent per `waypoint:good`. Kept on disk too: a market
   * only lists them again when a ship is there, so after a restart the rival
   * traffic on routes nobody revisited read as zero.
   */
  private trades = new Map<string, SeenTrade[]>();
  private file = dataFile("prices.json");
  private tradesFile = dataFile("trades.json");

  constructor() {
    this.history = loadJson<History>(this.file, {});
    const now = Date.now();
    for (const [key, arr] of Object.entries(loadJson<Record<string, SeenTrade[]>>(this.tradesFile, {}))) {
      if (Array.isArray(arr)) this.trades.set(key, arr.filter(t => typeof t?.ts === "number" && now - t.ts <= TRADE_LOG_MS));
    }
  }

  private persist(): void {
    saveJsonAtomic(this.file, this.history);
  }

  record(market: Market, ts = Date.now()): void {
    let changed = false;
    for (const g of market.tradeGoods ?? []) {
      const key = `${market.symbol}:${g.symbol}`;
      const arr = (this.history[key] ?? []);
      arr.push({
        waypoint: market.symbol,
        good: g.symbol,
        purchasePrice: g.purchasePrice ?? null,
        sellPrice: g.sellPrice ?? null,
        volume: g.tradeVolume ?? null,
        type: g.type,
        supply: g.supply,
        activity: g.activity,
        ts,
      });
      this.history[key] = arr.slice(-PER_KEY);
      changed = true;
    }
    if (changed) this.persist();
    this.recordTrades(market.transactions ?? [], ts);
  }

  private recordTrades(txs: MarketTransaction[], now: number): void {
    if (!txs.length) return;
    for (const t of txs) {
      const key = `${t.waypointSymbol}:${t.tradeSymbol}`;
      const ts = Date.parse(t.timestamp);
      if (!Number.isFinite(ts)) continue;
      const arr = this.trades.get(key) ?? [];
      if (!arr.some(x => x.ship === t.shipSymbol && x.ts === ts && x.type === t.type)) {
        arr.push({ ship: t.shipSymbol, type: t.type, units: t.units, ts });
      }
      this.trades.set(key, arr.filter(x => now - x.ts <= TRADE_LOG_MS));
    }
    saveJsonAtomic(this.tradesFile, Object.fromEntries(this.trades));
  }

  /**
   * % change of one price series between the earliest reading in the last
   * hour (at least 10 minutes older than the latest) and the latest reading.
   */
  change(waypoint: string, good: string, side: "youPay" | "youGet", now = Date.now()): number | null {
    return priceChange(this.history[`${waypoint}:${good}`] ?? [], side, now);
  }

  /** Units of `good` other agents moved at `waypoint` (type PURCHASE or SELL) since `since`, or null when no trades were ever seen there. */
  othersTraded(waypoint: string, good: string, type: SeenTrade["type"], isOurs: (ship: string) => boolean, since: number): number | null {
    const arr = this.trades.get(`${waypoint}:${good}`);
    if (!arr) return null;
    return arr.filter(t => t.type === type && t.ts >= since && !isOurs(t.ship)).reduce((n, t) => n + t.units, 0);
  }

  /** limit = points per waypoint:good series; cap = max points overall (default 5×limit). */
  query(opts: { good?: string; waypoint?: string; limit?: number; cap?: number } = {}): PricePoint[] {
    const limit = opts.limit ?? 30;
    const out: PricePoint[] = [];
    for (const [key, arr] of Object.entries(this.history)) {
      const [waypoint, good] = key.split(":");
      if (opts.waypoint && waypoint !== opts.waypoint) continue;
      if (opts.good && good !== opts.good) continue;
      out.push(...arr.slice(-limit));
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, opts.cap ?? limit * 5);
  }

  /** Latest observation per (waypoint, good). */
  latest(): PricePoint[] {
    return Object.values(this.history).map(arr => arr[arr.length - 1]).filter((p): p is PricePoint => !!p);
  }

  /** Markets observed, with the time of their latest observation. */
  marketsSeen(): Map<string, number> {
    const out = new Map<string, number>();
    for (const p of this.latest()) out.set(p.waypoint, Math.max(out.get(p.waypoint) ?? 0, p.ts));
    return out;
  }

  /**
   * Compact lines for a market priced within maxAgeMs, one per good:
   * "FOOD IMPORT pay 5034 get 2495 vol 60" (pay = what you pay to buy here,
   * get = what you get selling here). Null when not priced that recently.
   */
  snapshot(waypoint: string, maxAgeMs: number, now = Date.now()): string[] | null {
    const points = this.latest().filter(p => p.waypoint === waypoint && now - p.ts <= maxAgeMs);
    if (!points.length) return null;
    return points
      .sort((a, b) => a.good.localeCompare(b.good))
      .map(p => `${p.good} ${p.type ?? "?"} pay ${p.purchasePrice ?? "-"} get ${p.sellPrice ?? "-"} vol ${p.volume ?? "-"}`);
  }

  bestPrices(good: string): { buyFrom: PricePoint | undefined; sellTo: PricePoint | undefined } {
    const points = this.query({ good, limit: PER_KEY });
    // You can only buy where the good is exported/exchanged and sell where it is imported/exchanged.
    const sells = points.filter(p => p.purchasePrice != null && p.type !== "IMPORT");
    const buys = points.filter(p => p.sellPrice != null && p.type !== "EXPORT");
    return {
      buyFrom: sells.sort((a, b) => (a.purchasePrice ?? 0) - (b.purchasePrice ?? 0))[0],
      sellTo: buys.sort((a, b) => (b.sellPrice ?? 0) - (a.sellPrice ?? 0))[0],
    };
  }
}

/**
 * Best buy-here/sell-there spreads from the latest observation of every
 * (waypoint, good). Pure over the given points so it can be tested.
 */
export function computeTradeLeads(
  latest: PricePoint[],
  opts: {
    now?: number;
    maxAgeMs?: number;
    limit?: number;
    distance?: (a: string, b: string) => number | null;
    /** Units other agents moved on this route recently (see PriceHistory.othersTraded), null when unknown. */
    competition?: (good: string, buyAt: string, sellAt: string) => number | null;
    /** % change of a price series over about the last hour (see PriceHistory.change), null when too little history. */
    change?: (waypoint: string, good: string, side: "youPay" | "youGet") => number | null;
  } = {},
): TradeLead[] {
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? 24 * 3600_000;
  const fresh = latest.filter(p => now - p.ts <= maxAge);
  const byGood = new Map<string, PricePoint[]>();
  for (const p of fresh) byGood.set(p.good, [...(byGood.get(p.good) ?? []), p]);
  const leads: TradeLead[] = [];
  for (const [good, points] of byGood) {
    for (const src of points) {
      if (src.purchasePrice == null || src.type === "IMPORT") continue;
      for (const dst of points) {
        if (dst.waypoint === src.waypoint || dst.sellPrice == null || dst.type === "EXPORT") continue;
        const margin = dst.sellPrice - src.purchasePrice;
        if (margin <= 0) continue;
        const units = Math.min(src.volume ?? 1, dst.volume ?? 1);
        leads.push({
          good,
          buyAt: src.waypoint,
          youPay: src.purchasePrice,
          sellAt: dst.waypoint,
          youGet: dst.sellPrice,
          marginPerUnit: margin,
          unitsPerTrade: units,
          profitPerTrade: margin * units,
          distance: opts.distance?.(src.waypoint, dst.waypoint) ?? null,
          ageMinutes: Math.round((now - Math.min(src.ts, dst.ts)) / 60_000),
          buySupply: src.supply,
          sellSupply: dst.supply,
        });
      }
    }
  }
  const top = leads.sort((a, b) => b.profitPerTrade - a.profitPerTrade).slice(0, opts.limit ?? 8);
  for (const lead of top) {
    const others = opts.competition?.(lead.good, lead.buyAt, lead.sellAt);
    if (others != null) lead.othersTradedLastHour = others;
    const pay = opts.change?.(lead.buyAt, lead.good, "youPay");
    if (pay != null) lead.youPayChange1hPct = pay;
    const get = opts.change?.(lead.sellAt, lead.good, "youGet");
    if (get != null) lead.youGetChange1hPct = get;
  }
  return top;
}

export const prices = new PriceHistory();

const TREND_WINDOW_MS = 3600_000;
const TREND_MIN_SPAN_MS = 10 * 60_000;

/** Pure: see PriceHistory.change. Points are oldest first. */
export function priceChange(points: PricePoint[], side: "youPay" | "youGet", now: number): number | null {
  const field = side === "youPay" ? "purchasePrice" : "sellPrice";
  const latest = points[points.length - 1];
  const last = latest?.[field];
  if (!latest || last == null) return null;
  const ref = points.find(p => p.ts >= now - TREND_WINDOW_MS && p.ts <= latest.ts - TREND_MIN_SPAN_MS && p[field] != null);
  const first = ref?.[field];
  if (!first) return null;
  return Math.round(((last - first) / first) * 100);
}

/** Competition lookup for computeTradeLeads: others' buys at the source plus others' sells at the sink over the last hour. */
export function routeCompetition(isOurs: (ship: string) => boolean, now = Date.now()) {
  return (good: string, buyAt: string, sellAt: string): number | null => {
    const since = now - 3600_000;
    const atSource = prices.othersTraded(buyAt, good, "PURCHASE", isOurs, since);
    const atSink = prices.othersTraded(sellAt, good, "SELL", isOurs, since);
    return atSource == null && atSink == null ? null : (atSource ?? 0) + (atSink ?? 0);
  };
}
