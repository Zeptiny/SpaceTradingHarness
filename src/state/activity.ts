import type { ToolOutcome } from "../events/bus.js";
import { appendJsonl, dataFile, parseJsonl, readTail } from "./persist.js";

export interface ActivityEntry {
  id: number;
  ts: number;
  kind: "tool" | "wake" | "summary" | "system";
  tool?: string | undefined;
  args?: unknown;
  outcome?: ToolOutcome | undefined;
  result?: unknown;
  guards?: { guard: string; ok: boolean; reason?: string | undefined }[] | undefined;
  requestsSpent?: number | undefined;
  durationMs?: number | undefined;
  text?: string | undefined;
}

const RING = 500;

class ActivityLog {
  private entries: ActivityEntry[] = [];
  private nextId = 1;
  private file = dataFile("activity.jsonl");

  constructor() {
    for (const e of parseJsonl(readTail(this.file)) as ActivityEntry[]) {
      if (typeof e.id === "number" && Number.isFinite(e.id)) {
        this.entries.push(e);
        this.nextId = Math.max(this.nextId, e.id + 1);
      }
    }
  }

  append(entry: Omit<ActivityEntry, "id" | "ts"> & { ts?: number }): ActivityEntry {
    const full: ActivityEntry = { id: this.nextId++, ts: entry.ts ?? Date.now(), ...entry };
    this.entries.push(full);
    if (this.entries.length > RING) this.entries.shift();
    appendJsonl(this.file, full, 8 * 1024 * 1024, RING);
    return full;
  }

  query(opts: { tool?: string | undefined; outcome?: ToolOutcome | undefined; since?: number | undefined; limit?: number | undefined } = {}): ActivityEntry[] {
    let out = this.entries;
    if (opts.tool) out = out.filter(e => e.tool === opts.tool);
    if (opts.outcome) out = out.filter(e => e.outcome === opts.outcome);
    if (opts.since) out = out.filter(e => e.ts > opts.since!);
    const limit = opts.limit ?? 100;
    return out.slice(-limit);
  }
}

export const activity = new ActivityLog();
