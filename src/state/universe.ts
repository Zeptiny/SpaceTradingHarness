import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { transport } from "../transport/http.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";
import type { Agent } from "../generated/types.js";

/**
 * Which game universe the data directory belongs to. SpaceTraders wipes the
 * universe at every server reset (new systems, waypoints and agents), and a
 * new token can mean a different agent; either way prices, the atlas,
 * routines, earnings and notes on disk describe a world that no longer
 * exists. checkUniverse() runs before any store loads its file and moves the
 * old files into data/archive/ when the reset date or agent changed.
 */
export interface UniverseMarker {
  resetDate: string;
  agent: string;
}

export interface ServerInfo {
  resetDate: string | null;
  nextReset: string | null;
  resetFrequency: string | null;
  /** Panel only; never shown to the model. */
  leaderboards: Leaderboards | null;
  fetchedAt: number;
}

export interface Leaderboards {
  mostCredits: { agentSymbol: string; credits: number }[];
  mostSubmittedCharts: { agentSymbol: string; chartCount: number }[];
}

const MARKER = "universe.json";
const ARCHIVE_DIR = "archive";
// Re-read by working memory and the collector; 15 minutes keeps the panel's leaderboard current for ~4 requests an hour.
const STATUS_TTL_MS = 15 * 60_000;

let server: ServerInfo | null = null;

interface StatusBody {
  resetDate?: string;
  serverResets?: { next?: string; frequency?: string };
  leaderboards?: Leaderboards;
}

/** Pure: what to do with the data directory given the stored and current markers. */
export function universeAction(prev: UniverseMarker | null, cur: UniverseMarker): "adopt" | "same" | "archive" {
  if (!prev) return "adopt"; // first run with this check: nothing to compare against, keep what is there
  return prev.resetDate === cur.resetDate && prev.agent === cur.agent ? "same" : "archive";
}

function archiveDataDir(prev: UniverseMarker): string {
  const dir = config.dataDir;
  const target = path.join(dir, ARCHIVE_DIR, `${prev.resetDate.replace(/[^\w-]/g, "_")}-${prev.agent}-${Date.now()}`);
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name === ARCHIVE_DIR || name === MARKER) continue;
    renameSync(path.join(dir, name), path.join(target, name));
  }
  return target;
}

async function fetchStatus(): Promise<ServerInfo> {
  const { data } = await transport.request<StatusBody>("getStatus");
  server = {
    resetDate: data.resetDate ?? null,
    nextReset: data.serverResets?.next ?? null,
    resetFrequency: data.serverResets?.frequency ?? null,
    leaderboards: data.leaderboards ?? null,
    fetchedAt: Date.now(),
  };
  return server;
}

/**
 * Startup check (two requests). Must run before the stores are imported, so
 * the entry point awaits it before loading the rest of the harness.
 */
export async function checkUniverse(): Promise<void> {
  try {
    const [status, agent] = await Promise.all([
      fetchStatus(),
      transport.request<Agent>("getMyAgent").then(r => r.data),
    ]);
    if (!status.resetDate) return;
    const cur: UniverseMarker = { resetDate: status.resetDate, agent: agent.symbol };
    const file = dataFile(MARKER);
    const prev = existsSync(file) ? loadJson<UniverseMarker | null>(file, null) : null;
    const action = universeAction(prev, cur);
    if (action === "archive" && prev) {
      const where = archiveDataDir(prev);
      console.warn(`[universe] ${prev.agent} @ reset ${prev.resetDate} → ${cur.agent} @ reset ${cur.resetDate}: old data moved to ${where}`);
    }
    if (action !== "same") saveJsonAtomic(file, cur);
  } catch (err) {
    console.warn("[universe] reset check skipped:", err instanceof Error ? err.message : err);
  }
}

/** Last status read, without fetching (for the panel). */
export function currentServer(): ServerInfo | null {
  return server;
}

/** Demo fixtures only. */
export function setServerInfo(info: ServerInfo): void {
  server = info;
}

/** Server status (reset schedule, leaderboards), re-read at most every 15 minutes. Null when the status call fails. */
export async function serverInfo(): Promise<ServerInfo | null> {
  if (server && Date.now() - server.fetchedAt < STATUS_TTL_MS) return server;
  try {
    return await fetchStatus();
  } catch (err) {
    console.warn("[universe] status read failed:", err instanceof Error ? err.message : err);
    return server;
  }
}
