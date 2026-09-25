import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";
import { bus } from "../events/bus.js";

/**
 * Ship routines: repetitive jobs the harness runs itself (see
 * routines/engine.ts) so the agent plans once instead of spending an LLM
 * round per step. This module is only the persisted record of who runs what;
 * it survives restarts so running routines resume.
 */
export type RoutineSpec =
  | {
      kind: "trade";
      good: string;
      buyAt: string;
      sellAt: string;
      /** Stop when youGet at sellAt − youPay at buyAt falls below this per unit. */
      minMarginPerUnit?: number | undefined;
    }
  | {
      kind: "mine";
      asteroid: string;
      /** Where to sell the haul; without it the routine stops when the hold is full. */
      sellAt?: string | undefined;
      /** Goods to keep; anything else extracted is jettisoned at once. Omit to keep everything. */
      keep?: string[] | undefined;
      /** Deliver goods an accepted contract needs before selling. */
      deliverContract?: boolean | undefined;
    }
  | {
      kind: "scout";
      /** Markets to cycle through; default every market in the ship's system. */
      waypoints?: string[] | undefined;
    }
  | {
      kind: "goto";
      destination: string;
    };

export interface RoutineRecord {
  ship: string;
  spec: RoutineSpec;
  status: "running" | "stopped" | "done";
  startedAt: number;
  updatedAt: number;
  /** Completed loops: trade round trips, mining hauls sold, markets scouted. */
  trips: number;
  /** Credits in minus credits out from this routine's own trades and fuel. */
  profit: number;
  /** Short description of what it is doing now. */
  phase: string;
  /** Why it stopped or finished. */
  endReason?: string | undefined;
  /** Scout: the market it is heading to (so two scouts don't pick the same one). */
  target?: string | undefined;
}

type RoutineFile = Record<string, RoutineRecord>;

export function describeSpec(spec: RoutineSpec): string {
  switch (spec.kind) {
    case "trade":
      return `trade ${spec.good} ${spec.buyAt} → ${spec.sellAt}`;
    case "mine":
      return `mine ${spec.asteroid}${spec.sellAt ? ` → sell at ${spec.sellAt}` : ""}${spec.keep ? ` (keep ${spec.keep.join(",")})` : ""}${spec.deliverContract ? " + contract deliveries" : ""}`;
    case "scout":
      return `scout ${spec.waypoints?.length ? spec.waypoints.join(",") : "system markets"}`;
    case "goto":
      return `goto ${spec.destination}`;
  }
}

class RoutineStore {
  private data: RoutineFile;
  private file = dataFile("routines.json");

  constructor() {
    this.data = loadJson<RoutineFile>(this.file, {});
  }

  private persist(): void {
    saveJsonAtomic(this.file, this.data);
    bus.emit({ type: "StateChanged", ts: Date.now(), keys: ["routines"] });
  }

  start(ship: string, spec: RoutineSpec): RoutineRecord {
    const now = Date.now();
    const rec: RoutineRecord = { ship, spec, status: "running", startedAt: now, updatedAt: now, trips: 0, profit: 0, phase: "starting" };
    this.data[ship] = rec;
    this.persist();
    return rec;
  }

  update(ship: string, patch: Partial<Omit<RoutineRecord, "ship" | "spec" | "startedAt">>): RoutineRecord | undefined {
    const rec = this.data[ship];
    if (!rec) return undefined;
    Object.assign(rec, patch, { updatedAt: Date.now() });
    this.persist();
    return rec;
  }

  end(ship: string, status: "stopped" | "done", reason: string): RoutineRecord | undefined {
    return this.update(ship, { status, endReason: reason, phase: status, target: undefined });
  }

  get(ship: string): RoutineRecord | undefined {
    return this.data[ship];
  }

  /** The routine a ship is running right now, if any. */
  active(ship: string): RoutineRecord | undefined {
    const rec = this.data[ship];
    return rec?.status === "running" ? rec : undefined;
  }

  running(): RoutineRecord[] {
    return Object.values(this.data).filter(r => r.status === "running");
  }

  all(): RoutineRecord[] {
    return Object.values(this.data);
  }

  /** Forget ships that no longer exist (scrapped). */
  prune(existing: string[]): void {
    const keep = new Set(existing);
    let changed = false;
    for (const ship of Object.keys(this.data)) {
      if (!keep.has(ship)) {
        delete this.data[ship];
        changed = true;
      }
    }
    if (changed) this.persist();
  }
}

export const routines = new RoutineStore();
