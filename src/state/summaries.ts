import { appendJsonl, dataFile, parseJsonl, readTail } from "./persist.js";

export interface LoopSummary {
  wake: number;
  ts: number;
  reason: string;
  text: string;
  actions: { tool: string; outcome: string }[];
}

class Summaries {
  private items: LoopSummary[] = [];
  private file = dataFile("summaries.jsonl");
  private wakeCounter = 0;

  constructor() {
    for (const e of parseJsonl(readTail(this.file)) as LoopSummary[]) {
      if (typeof e.wake === "number" && Number.isFinite(e.wake)) {
        this.items.push(e);
        this.wakeCounter = Math.max(this.wakeCounter, e.wake);
      }
    }
  }

  nextWakeId(): number {
    return ++this.wakeCounter;
  }

  add(reason: string, text: string, actions: { tool: string; outcome: string }[]): LoopSummary {
    const s: LoopSummary = { wake: this.wakeCounter, ts: Date.now(), reason, text, actions };
    this.items.push(s);
    if (this.items.length > 200) this.items.shift();
    appendJsonl(this.file, s, 4 * 1024 * 1024, 200);
    return s;
  }

  recent(n = 20): LoopSummary[] {
    return this.items.slice(-n);
  }
}

export const summaries = new Summaries();
