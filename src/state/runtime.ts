import type { Wakeup } from "../agent/scheduler.js";

export interface RuntimeState {
  startedAt: number;
  paused: boolean;
  pausedShips: Set<string>;
  directive: string | null;
  pendingWakeups: Wakeup[];
  rate: { limit: number | null; remaining: number | null; resetAt: number | null };
  socket: { connected: boolean; lastEventAt: number | null; events: number };
}

export const runtime: RuntimeState = {
  startedAt: Date.now(),
  paused: false,
  pausedShips: new Set(),
  directive: null,
  pendingWakeups: [],
  rate: { limit: null, remaining: null, resetAt: null },
  socket: { connected: false, lastEventAt: null, events: 0 },
};
