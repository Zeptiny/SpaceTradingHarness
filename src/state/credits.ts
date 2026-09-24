import { appendJsonl, dataFile, parseJsonl, readTail } from "./persist.js";

export interface CreditPoint {
  ts: number;
  credits: number;
}

const RING = 2_000;
const HEARTBEAT_MS = 10 * 60_000; // record unchanged balances occasionally so the series spans idle time

// Credit balance over time, recorded whenever an Agent object passes through
// the harness (refreshes and every credit-changing action response). Panel-only.
class CreditHistory {
  private points: CreditPoint[] = [];
  private file = dataFile("credits.jsonl");

  constructor() {
    for (const p of parseJsonl(readTail(this.file)) as CreditPoint[]) {
      if (Number.isFinite(p.ts) && Number.isFinite(p.credits)) this.points.push(p);
    }
  }

  record(credits: number, ts = Date.now()): void {
    const last = this.points.at(-1);
    if (last && last.credits === credits && ts - last.ts < HEARTBEAT_MS) return;
    const p = { ts, credits };
    this.points.push(p);
    if (this.points.length > RING) this.points.shift();
    appendJsonl(this.file, p, 2 * 1024 * 1024, RING);
  }

  latest(): CreditPoint | undefined {
    return this.points.at(-1);
  }

  since(ts: number): CreditPoint[] {
    return this.points.filter(p => p.ts >= ts);
  }
}

export const creditHistory = new CreditHistory();
