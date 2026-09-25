import type { ToolOutcome } from "../events/bus.js";
import { appendJsonl, dataFile, parseJsonl, readTail } from "./persist.js";
import { runtime } from "./runtime.js";

export interface ActivityEntry {
  id: number;
  ts: number;
  /** Wake id this entry belongs to (absent for entries outside a wake). */
  wake?: number | undefined;
  kind: "tool" | "wake" | "thought" | "summary" | "system";
  tool?: string | undefined;
  args?: unknown;
  outcome?: ToolOutcome | undefined;
  /** One-line human summary of a tool call's outcome. */
  summary?: string | undefined;
  result?: unknown;
  guards?: { guard: string; ok: boolean; reason?: string | undefined }[] | undefined;
  requestsSpent?: number | undefined;
  durationMs?: number | undefined;
  text?: string | undefined;
  /** Model's native reasoning for a thought entry, when the endpoint returns it. */
  reasoning?: string | undefined;
}

const RING = 1_000;

class ActivityLog {
  private entries: ActivityEntry[] = [];
  private nextId = 1;
  private file = dataFile("activity.jsonl");

  constructor() {
    for (const e of parseJsonl(readTail(this.file, 4 * 1024 * 1024)) as ActivityEntry[]) {
      if (typeof e.id === "number" && Number.isFinite(e.id)) {
        this.entries.push(e);
        this.nextId = Math.max(this.nextId, e.id + 1);
      }
    }
  }

  append(entry: Omit<ActivityEntry, "id" | "ts"> & { ts?: number }): ActivityEntry {
    const full: ActivityEntry = { id: this.nextId++, ts: entry.ts ?? Date.now(), wake: runtime.wake?.id, ...entry };
    this.entries.push(full);
    if (this.entries.length > RING) this.entries.shift();
    appendJsonl(this.file, full, 8 * 1024 * 1024, RING);
    return full;
  }

  /** Highest wake id any entry carries. */
  lastWake(): number {
    return this.entries.reduce((n, e) => Math.max(n, e.wake ?? 0), 0);
  }

  query(opts: {
    tool?: string | undefined;
    outcome?: ToolOutcome | undefined;
    wake?: number | undefined;
    since?: number | undefined;
    limit?: number | undefined;
  } = {}): ActivityEntry[] {
    let out = this.entries;
    if (opts.tool) {
      const q = opts.tool.toLowerCase();
      out = out.filter(e => e.tool?.toLowerCase().includes(q));
    }
    if (opts.outcome) out = out.filter(e => e.outcome === opts.outcome);
    if (opts.wake !== undefined) out = out.filter(e => e.wake === opts.wake);
    if (opts.since) out = out.filter(e => e.ts > opts.since!);
    const limit = opts.limit ?? 100;
    return out.slice(-limit);
  }
}

export const activity = new ActivityLog();
