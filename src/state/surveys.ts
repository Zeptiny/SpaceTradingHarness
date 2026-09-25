import type { Survey } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

// Surveys from create_survey, kept exactly as the API returned them. The API
// only accepts a survey byte-for-byte (deposits as [{symbol}]), so the agent
// refers to one by signature and the harness sends the stored object.

class Surveys {
  private file = dataFile("surveys.json");
  private bySignature = new Map<string, Survey>();

  constructor() {
    for (const s of loadJson<Survey[]>(this.file, [])) this.bySignature.set(s.signature, s);
    this.prune();
  }

  private persist(): void {
    saveJsonAtomic(this.file, [...this.bySignature.values()]);
  }

  /** Drop expired surveys; returns whether anything was removed. */
  private prune(now = Date.now()): boolean {
    let removed = false;
    for (const [sig, s] of this.bySignature) {
      if (Date.parse(s.expiration) <= now) {
        this.bySignature.delete(sig);
        removed = true;
      }
    }
    return removed;
  }

  add(surveys: Survey[]): void {
    this.prune();
    for (const s of surveys) this.bySignature.set(s.signature, s);
    this.persist();
  }

  get(signature: string): Survey | undefined {
    if (this.prune()) this.persist();
    return this.bySignature.get(signature);
  }

  remove(signature: string): void {
    if (this.bySignature.delete(signature)) this.persist();
  }

  /** Live surveys, optionally only those for one waypoint. */
  active(waypointSymbol?: string): Survey[] {
    if (this.prune()) this.persist();
    return [...this.bySignature.values()].filter(s => !waypointSymbol || s.symbol === waypointSymbol);
  }
}

export const surveys = new Surveys();

/** What the agent sees: deposits flattened to names, which is fine because it never sends this back. */
export function compactSurvey(s: Survey) {
  return {
    signature: s.signature,
    waypoint: s.symbol,
    size: s.size,
    deposits: s.deposits.map(d => d.symbol),
    expiresInMinutes: Math.max(0, Math.round((Date.parse(s.expiration) - Date.now()) / 60_000)),
  };
}
