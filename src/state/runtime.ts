import type { Wakeup } from "../agent/scheduler.js";

export interface RuntimeState {
  startedAt: number;
  paused: boolean;
  pausedShips: Set<string>;
  directive: string | null;
  pendingWakeups: Wakeup[];
  rate: { limit: number | null; remaining: number | null; resetAt: number | null };
  /** SpaceTraders HTTP requests sent since process start (incl. retries). */
  requestsTotal: number;
  socket: { connected: boolean; lastEventAt: number | null; events: number };
  /** The wake currently executing, if any (only one runs at a time). */
  wake: { id: number; reason: string; startedAt: number; round: number } | null;
  lastWakeEndedAt: number | null;
  /** Cumulative LLM usage since process start. */
  llm: { calls: number; promptTokens: number; completionTokens: number; cachedTokens: number; errors: number; lastError: string | null };
}

export const runtime: RuntimeState = {
  startedAt: Date.now(),
  paused: false,
  pausedShips: new Set(),
  directive: null,
  pendingWakeups: [],
  rate: { limit: null, remaining: null, resetAt: null },
  requestsTotal: 0,
  socket: { connected: false, lastEventAt: null, events: 0 },
  wake: null,
  lastWakeEndedAt: null,
  llm: { calls: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, errors: 0, lastError: null },
};
