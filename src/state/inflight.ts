import { rmSync } from "node:fs";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * The wake that is running right now, saved after every round. A wake only
 * leaves a summary when it finishes, so without this a restart mid-wake
 * (crash, `tsx watch` reload, homeserver reboot) left no trace for the next
 * wake: the agent didn't know what it had just bought or where it had sent
 * ships, and the next wake reused the lost wake's id.
 */
export interface InflightWake {
  wake: number;
  reason: string;
  startedAt: number;
  round: number;
  tokens: { prompt: number; completion: number; cached: number };
  requests: number;
  creditsStart: number | null;
  /** The agent's last reply text. */
  thought: string;
  /** Latest tool outcomes, oldest first. */
  actions: { tool: string; outcome: string; summary: string }[];
  /** Last save: about when the wake was cut off. */
  savedAt?: number;
}

const KEEP_ACTIONS = 30;

class InflightStore {
  private file = dataFile("wake-inflight.json");

  save(w: InflightWake): void {
    try {
      saveJsonAtomic(this.file, { ...w, actions: w.actions.slice(-KEEP_ACTIONS), savedAt: Date.now() });
    } catch (err) {
      console.error("[inflight] save failed:", err instanceof Error ? err.message : err);
    }
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }

  /** The wake a previous run left unfinished, if any; forgets it. */
  take(): InflightWake | null {
    const w = loadJson<InflightWake | null>(this.file, null);
    this.clear();
    return w && typeof w.wake === "number" && Array.isArray(w.actions) ? w : null;
  }
}

export const inflight = new InflightStore();
