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
  endedBy: "end_loop" | "no-tool-calls" | "round-cap" | "action-cap" | "llm-error" | "error" | "interrupted";
}

/** The agent's end_loop report. */
export interface WakeReport {
  /** What was done this wake and why. */
  done: string;
  /** What happens next and why. */
  next: string;
  /** Overall picture and anything else worth knowing. */
  summary: string;
}

/** One text block for places that show a single string (lists, alerts). */
export function reportText(r: WakeReport): string {
  return `Done: ${r.done}\n\nNext: ${r.next}\n\nSummary: ${r.summary}`;
}

export interface LoopSummary {
  wake: number;
  ts: number;
  reason: string;
  /** Agent-written report (end_loop) as one text block when given, else the mechanical digest. */
  text: string;
  /** The end_loop report, field by field (absent when the wake ended any other way). */
  report?: WakeReport | undefined;
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

  /** `atLeast`: the highest wake id seen elsewhere (a wake cut off by a restart leaves activity but no summary). */
  nextWakeId(atLeast = 0): number {
    this.wakeCounter = Math.max(this.wakeCounter, atLeast);
    return ++this.wakeCounter;
  }

  /** Summarises the current wake, or `entry.wake` when given (a wake a restart cut off). */
  add(entry: Omit<LoopSummary, "wake" | "ts"> & { ts?: number; wake?: number }): LoopSummary {
    const wake = entry.wake ?? this.wakeCounter;
    this.wakeCounter = Math.max(this.wakeCounter, wake);
    const s: LoopSummary = { ...entry, wake, ts: entry.ts ?? Date.now() };
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
