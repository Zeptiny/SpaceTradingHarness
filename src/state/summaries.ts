import { appendJsonl, dataFile, parseJsonl, readTail } from "./persist.js";

export interface WakeStats {
  startedAt: number;
  durationMs: number;
  rounds: number;
  requests: number;
  tokens: { prompt: number; completion: number; cached: number };
  creditsStart: number | null;
  creditsEnd: number | null;
  /** Why the wake stopped: agent called end_loop, or a harness cap/error. */
  endedBy: "end_loop" | "no-tool-calls" | "round-cap" | "action-cap" | "llm-error" | "error";
}

export interface LoopSummary {
  wake: number;
  ts: number;
  reason: string;
  /** Agent-written summary (end_loop) when given, else the mechanical digest. */
  text: string;
  /** Mechanical digest of tool outcomes. */
  details?: string | undefined;
  actions: { tool: string; outcome: string }[];
  stats?: WakeStats | undefined;
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

  add(entry: Omit<LoopSummary, "wake" | "ts"> & { ts?: number }): LoopSummary {
    const s: LoopSummary = { wake: this.wakeCounter, ...entry, ts: entry.ts ?? Date.now() };
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
