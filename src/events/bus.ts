export type HarnessEvent =
  | { type: "ToolCalled"; ts: number; tool: string; args: unknown; outcome: ToolOutcome; summary: string; requestsSpent: number; durationMs: number }
  | { type: "GuardFailed"; ts: number; tool: string; guard: string; reason: string }
  | { type: "RateBudgetChanged"; ts: number; remaining: number | null; limit: number | null; resetAt: number | null }
  | { type: "AgentWoke"; ts: number; reason: string; scope: string }
  | { type: "AgentSleeping"; ts: number; nextWakeAt: number | null; reason: string }
  | { type: "PlanUpdated"; ts: number; thought: string; calls: { tool: string; args: unknown }[] }
  | { type: "LoopSummary"; ts: number; wake: number; text: string }
  | { type: "GameEvent"; ts: number; event: string; payload: unknown }
  | { type: "Command"; ts: number; command: "pause" | "resume" | "wake" | "directive"; reason?: string; text?: string }
  | { type: "StateChanged"; ts: number; keys: string[] };

export type ToolOutcome = "ok" | "guard-rejected" | "api-error" | "blocked-by-policy" | "local-error" | "unknown-tool";

export const TOOL_OUTCOMES: readonly ToolOutcome[] = [
  "ok", "guard-rejected", "api-error", "blocked-by-policy", "local-error", "unknown-tool",
] as const;

type Handler = (e: HarnessEvent) => void;

class EventBus {
  private handlers: Handler[] = [];
  private buffer: HarnessEvent[] = [];
  private readonly bufferSize = 1000;

  subscribe(fn: Handler): () => void {
    this.handlers.push(fn);
    return () => {
      this.handlers = this.handlers.filter(h => h !== fn);
    };
  }

  emit(event: HarnessEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.bufferSize) this.buffer.shift();
    for (const h of [...this.handlers]) {
      try {
        h(event);
      } catch (err) {
        console.error("[bus] handler error", err);
      }
    }
  }

  recent(n = 100, sinceTs = 0): HarnessEvent[] {
    return this.buffer.filter(e => e.ts > sinceTs).slice(-n);
  }
}

export const bus = new EventBus();
