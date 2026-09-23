import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

export interface AgentPlan {
  thought: string;
  calls: { tool: string; args: unknown }[];
}

export interface Checkpoint {
  ts: number;
  wakeId: number;
  reason: string;
  plan: AgentPlan | null;
  resultsSummary: string;
}

class CheckpointStore {
  private file = dataFile("checkpoint.json");
  current: Checkpoint | null;

  constructor() {
    this.current = loadJson<Checkpoint | null>(this.file, null);
  }

  save(cp: Omit<Checkpoint, "ts">): void {
    this.current = { ts: Date.now(), ...cp };
    saveJsonAtomic(this.file, this.current);
  }
}

export const checkpointStore = new CheckpointStore();
