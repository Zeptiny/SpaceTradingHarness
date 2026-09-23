import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { runtime } from "../state/runtime.js";

export interface Wakeup {
  at: number;
  reason: string;
  scope: string;
}

type WakeListener = (wakeup: Wakeup) => void;

const MAX_WAKEUPS = 200;

class Scheduler {
  private wakeups: Wakeup[] = [];
  private timer: NodeJS.Timeout | null = null;
  private armedFor: number | null = null;
  private listeners: WakeListener[] = [];
  paused = false;
  pausedShips = new Set<string>();
  directive: string | null = null;

  constructor() {
    runtime.paused = false;
    runtime.directive = null;
  }

  onWake(fn: WakeListener): void {
    this.listeners.push(fn);
  }

  schedule(at: number, reason: string, scope = "all"): void {
    if (this.paused) return; // global pause gates every scope
    if (scope !== "all" && this.pausedShips.has(scope)) return;
    this.push({ at, reason, scope });
  }

  private push(w: Wakeup): void {
    const dup = this.wakeups.find(
      x => x.scope === w.scope && Math.abs(x.at - w.at) <= config.agent.minWakeGapMs,
    );
    if (dup) {
      dup.at = Math.max(dup.at, w.at);
      dup.reason = dup.reason === w.reason ? dup.reason : `${dup.reason}; ${w.reason}`;
    } else {
      this.wakeups.push(w);
    }
    this.wakeups.sort((a, b) => a.at - b.at);
    if (this.wakeups.length > MAX_WAKEUPS) {
      // drop the latest requeue-style duplicates first (same reason), else the oldest
      const dupIdx = this.wakeups.slice(1).findIndex(x => x.reason === this.wakeups[0]!.reason);
      this.wakeups.splice(dupIdx >= 0 ? dupIdx + 1 : 0, 1);
    }
    this.syncRuntime();
    this.arm();
  }

  wakeNow(reason: string, opts: { ignorePause?: boolean } = {}): void {
    if (this.paused && !opts.ignorePause) return;
    this.fire({ at: Date.now(), reason, scope: "all" });
  }

  private arm(): void {
    const next = this.wakeups[0];
    if (!next) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        this.armedFor = null;
      }
      bus.emit({ type: "AgentSleeping", ts: Date.now(), nextWakeAt: null, reason: this.paused ? "paused" : "no wakeups" });
      return;
    }
    // Re-arm whenever the head is earlier than what the current timer targets.
    if (this.timer && this.armedFor !== null && next.at >= this.armedFor) return;
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(0, next.at - Date.now());
    this.armedFor = next.at;
    this.timer = setTimeout(() => this.onTimer(), Math.min(delay, 2 ** 31 - 1));
  }

  private onTimer(): void {
    this.timer = null;
    this.armedFor = null;
    if (this.paused) {
      this.timer = setTimeout(() => this.onTimer(), 1_000); // hold fire while paused
      return;
    }
    const head = this.wakeups[0];
    if (!head) return;
    if (head.at > Date.now() + 50) {
      // clamped far-future timer fired early — re-arm, don't fire
      this.arm();
      return;
    }
    this.wakeups.shift();
    this.syncRuntime();
    this.fire(head);
    this.arm();
  }

  private fire(w: Wakeup): void {
    for (const l of [...this.listeners]) {
      try {
        l(w);
      } catch (err) {
        console.error("[scheduler] listener error", err);
      }
    }
  }

  private syncRuntime(): void {
    runtime.pendingWakeups = [...this.wakeups];
  }

  pending(): Wakeup[] {
    return [...this.wakeups];
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    runtime.paused = paused;
    if (!paused) {
      this.schedule(Date.now() + 500, "resumed by user");
    }
    this.syncRuntime();
    bus.emit({ type: "AgentSleeping", ts: Date.now(), nextWakeAt: null, reason: paused ? "paused by user" : "resumed" });
  }

  setDirective(text: string | null): void {
    this.directive = text ? text.slice(0, 2000) : null;
    runtime.directive = this.directive;
  }
}

export const scheduler = new Scheduler();
