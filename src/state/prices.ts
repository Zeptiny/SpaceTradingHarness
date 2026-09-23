import type { Market } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

export interface PricePoint {
  waypoint: string;
  good: string;
  purchasePrice: number | null;
  sellPrice: number | null;
  volume: number | null;
  ts: number;
}

type History = Record<string, PricePoint[]>;

const PER_KEY = 60;

class PriceHistory {
  private history: History = {};
  private file = dataFile("prices.json");

  constructor() {
    this.history = loadJson<History>(this.file, {});
  }

  private persist(): void {
    saveJsonAtomic(this.file, this.history);
  }

  record(market: Market): void {
    const ts = Date.now();
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
        ts,
      });
      this.history[key] = arr.slice(-PER_KEY);
      changed = true;
    }
    if (changed) this.persist();
  }

  query(opts: { good?: string; waypoint?: string; limit?: number } = {}): PricePoint[] {
    const limit = opts.limit ?? 30;
    const out: PricePoint[] = [];
    for (const [key, arr] of Object.entries(this.history)) {
      const [waypoint, good] = key.split(":");
      if (opts.waypoint && waypoint !== opts.waypoint) continue;
      if (opts.good && good !== opts.good) continue;
      out.push(...arr.slice(-limit));
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, limit * 5);
  }

  bestPrices(good: string): { buyFrom: PricePoint | undefined; sellTo: PricePoint | undefined } {
    const points = this.query({ good, limit: PER_KEY });
    const sells = points.filter(p => p.purchasePrice != null);
    const buys = points.filter(p => p.sellPrice != null);
    return {
      buyFrom: sells.sort((a, b) => (a.purchasePrice ?? 0) - (b.purchasePrice ?? 0))[0],
      sellTo: buys.sort((a, b) => (b.sellPrice ?? 0) - (a.sellPrice ?? 0))[0],
    };
  }
}

export const prices = new PriceHistory();
