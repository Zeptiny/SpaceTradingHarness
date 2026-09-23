import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (check .env)`);
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

export type AgentPolicy = "full" | "readonly";

export const config = {
  apiToken: required("API_TOKEN"),
  baseUrl: process.env.ST_BASE_URL ?? "https://api.spacetraders.io/v2",
  llm: {
    url: required("OPENAI_API_URL").replace(/\/+$/, ""),
    apiKey: required("OPENAI_API_KEY"),
    model: required("LLM_MODEL"),
    timeoutMs: num("LLM_TIMEOUT_MS", 120_000),
  },
  panelHost: process.env.PANEL_HOST ?? "127.0.0.1",
  panelPort: num("PANEL_PORT", 8787),
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  agent: {
    policy: (process.env.AGENT_POLICY === "readonly" ? "readonly" : "full") as AgentPolicy,
    maxActionsPerWake: num("AGENT_MAX_ACTIONS_PER_WAKE", 8),
    maxRoundsPerWake: num("AGENT_MAX_ROUNDS_PER_WAKE", 12),
    maxConcurrentTools: num("AGENT_MAX_CONCURRENT_TOOLS", 3),
    wakeTimeoutMs: num("AGENT_WAKE_TIMEOUT_MS", 180_000),
    fallbackWakeMs: num("AGENT_FALLBACK_WAKE_MS", 10 * 60_000),
    minWakeGapMs: num("AGENT_MIN_WAKE_GAP_MS", 10_000),
  },
  transport: {
    minIntervalMs: num("TRANSPORT_MIN_INTERVAL_MS", 600),
    maxRetries: num("TRANSPORT_MAX_RETRIES", 2),
    timeoutMs: num("TRANSPORT_TIMEOUT_MS", 20_000),
    maxRetryAfterMs: num("TRANSPORT_MAX_RETRY_AFTER_MS", 15_000),
  },
};

export type Config = typeof config;
