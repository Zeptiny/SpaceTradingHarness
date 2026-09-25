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
    // Send the model's reasoning back on its earlier assistant messages (some
    // thinking models need it across tool calls). Set 0 if the endpoint rejects it.
    echoReasoning: process.env.LLM_ECHO_REASONING !== "0" && process.env.LLM_ECHO_REASONING !== "false",
  },
  panelHost: process.env.PANEL_HOST ?? "127.0.0.1",
  panelPort: num("PANEL_PORT", 8787),
  // Extra hostnames/IPs (comma-separated, port ignored) the panel accepts besides localhost; "*" accepts any.
  panelAllowedHosts: (process.env.PANEL_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(h => h.trim().toLowerCase())
    .filter(Boolean),
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  agent: {
    policy: (process.env.AGENT_POLICY === "readonly" ? "readonly" : "full") as AgentPolicy,
    maxActionsPerWake: num("AGENT_MAX_ACTIONS_PER_WAKE", 32),
    // Action budget scales with fleet size so every ship can get a full job per wake.
    actionsPerShip: num("AGENT_ACTIONS_PER_SHIP", 6),
    // Credits the agent must keep on hand (fuel, cargo capital); ship purchases may not dip below it.
    creditReserve: num("AGENT_CREDIT_RESERVE", 25_000),
    // API requests the wake-start collector may spend reading markets/shipyards where ships sit (0 disables).
    autoScanRequests: num("AGENT_AUTO_SCAN_REQUESTS", 8),
    maxRoundsPerWake: num("AGENT_MAX_ROUNDS_PER_WAKE", 32),
    maxConcurrentTools: num("AGENT_MAX_CONCURRENT_TOOLS", 3),
    fallbackWakeMs: num("AGENT_FALLBACK_WAKE_MS", 10 * 60_000),
    minWakeGapMs: num("AGENT_MIN_WAKE_GAP_MS", 60_000),
  },
  transport: {
    minIntervalMs: num("TRANSPORT_MIN_INTERVAL_MS", 600),
    maxRetries: num("TRANSPORT_MAX_RETRIES", 2),
    timeoutMs: num("TRANSPORT_TIMEOUT_MS", 20_000),
    maxRetryAfterMs: num("TRANSPORT_MAX_RETRY_AFTER_MS", 15_000),
  },
};

export type Config = typeof config;
