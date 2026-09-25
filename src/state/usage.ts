import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";
import { runtime } from "./runtime.js";

/**
 * LLM and API usage summed across restarts (runtime.llm and
 * runtime.requestsTotal only count since process start). Panel-only.
 * Archived with the rest of data/ on a server reset or agent change.
 *
 * Requests are read off runtime.requestsTotal rather than counted here: the
 * transport loads before the startup reset check archives data/, so it must
 * not hold a store of its own.
 */
export interface UsageTotals {
  /** When counting started (first run with this file). */
  since: number;
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  llmErrors: number;
  requests: number;
}

// Request counts are saved at this interval (and with every LLM call); a crash loses at most this much.
const SAVE_EVERY_MS = 30_000;

class UsageStore {
  private file = dataFile("usage.json");
  private data: UsageTotals;
  private requestsAtLoad = runtime.requestsTotal;

  constructor() {
    const loaded = loadJson<Partial<UsageTotals>>(this.file, {});
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    this.data = {
      since: n(loaded.since) || Date.now(),
      llmCalls: n(loaded.llmCalls),
      promptTokens: n(loaded.promptTokens),
      completionTokens: n(loaded.completionTokens),
      cachedTokens: n(loaded.cachedTokens),
      llmErrors: n(loaded.llmErrors),
      requests: n(loaded.requests),
    };
    const timer = setInterval(() => this.flush(), SAVE_EVERY_MS);
    timer.unref?.();
  }

  llm(u: { prompt: number; completion: number; cached: number }): void {
    this.data.llmCalls++;
    this.data.promptTokens += u.prompt;
    this.data.completionTokens += u.completion;
    this.data.cachedTokens += u.cached;
    this.flush();
  }

  llmError(): void {
    this.data.llmErrors++;
    this.flush();
  }

  totals(): UsageTotals {
    return { ...this.data, requests: this.data.requests + runtime.requestsTotal - this.requestsAtLoad };
  }

  flush(): void {
    try {
      saveJsonAtomic(this.file, this.totals());
    } catch (err) {
      console.error("[usage] save failed:", err instanceof Error ? err.message : err);
    }
  }
}

export const usage = new UsageStore();
