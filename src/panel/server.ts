import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bus, TOOL_OUTCOMES, type ToolOutcome, type HarnessEvent } from "../events/bus.js";
import { activity } from "../state/activity.js";
import { memory } from "../state/memory.js";
import { summaries } from "../state/summaries.js";
import { checkpointStore } from "../state/checkpoint.js";
import { mirror, storeKeys, type FleetState } from "../state/store.js";
import { runtime } from "../state/runtime.js";
import { prices } from "../state/prices.js";
import { creditHistory } from "../state/credits.js";
import { toolCatalogJson } from "../tools/registry.js";
import { compactMarket, compactShip, compactWaypoint, contractSummary } from "../state/projections.js";
import { config } from "../config.js";
import type { Contract, Market, System, Waypoint } from "../generated/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startPanel(): void {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  // Localhost-only by default: reject foreign Host headers (DNS rebinding) and cross-origin requests.
  // PANEL_ALLOWED_HOSTS opts extra hostnames in; "*" accepts any Host but still requires same-origin.
  const allowAny = config.panelAllowedHosts.includes("*");
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]", ...config.panelAllowedHosts]);
  const hostnameOf = (hostPort: string): string | null => {
    try {
      return new URL(`http://${hostPort}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  };
  app.use("/api", (req, res, next) => {
    const host = req.headers.host ?? "";
    const hostname = hostnameOf(host);
    if (!hostname || (!allowAny && !allowedHosts.has(hostname))) {
      res.status(403).json({
        error: `panel is localhost-only; add "${hostname ?? host}" to PANEL_ALLOWED_HOSTS to allow it`,
      });
      return;
    }
    const origin = req.headers.origin;
    if (origin) {
      let o: URL | null = null;
      try {
        o = new URL(origin);
      } catch {
        // handled below
      }
      if (!o) {
        res.status(403).json({ error: "bad origin" });
        return;
      }
      const ok = allowAny ? o.host === host : allowedHosts.has(o.hostname.toLowerCase());
      if (!ok) {
        res.status(403).json({ error: "cross-origin requests rejected" });
        return;
      }
    }
    next();
  });

  // SSE stream: subscribe first, then replay to minimize the gap
  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const since = Number(req.query.since ?? 0);
    const unsub = bus.subscribe(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
    for (const e of bus.recent(50, since)) {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    }
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      unsub();
      clearInterval(ping);
    });
  });

  app.get("/api/state", (_req, res) => {
    const fleet = mirror.get<FleetState>(storeKeys.fleet);
    res.json({
      agent: mirror.get(storeKeys.agent) ?? null,
      fleet: fleet?.ships.map(compactShip) ?? [],
      contracts: (mirror.get<Contract[]>(storeKeys.contracts) ?? []).map(contractSummary),
      rate: runtime.rate,
      scheduler: {
        paused: runtime.paused,
        pausedShips: [...runtime.pausedShips],
        pending: runtime.pendingWakeups,
        directive: runtime.directive,
      },
      plan: checkpointStore.current,
      socket: runtime.socket,
      wake: runtime.wake,
      lastWakeEndedAt: runtime.lastWakeEndedAt,
      llm: runtime.llm,
      requestsTotal: runtime.requestsTotal,
      startedAt: runtime.startedAt,
      now: Date.now(),
      config: {
        model: config.llm.model,
        policy: config.agent.policy,
        port: config.panelPort,
        minIntervalMs: config.transport.minIntervalMs,
        maxActionsPerWake: config.agent.maxActionsPerWake,
        maxRoundsPerWake: config.agent.maxRoundsPerWake,
        maxConcurrentTools: config.agent.maxConcurrentTools,
        fallbackWakeMs: config.agent.fallbackWakeMs,
        minWakeGapMs: config.agent.minWakeGapMs,
      },
    });
  });

  app.get("/api/ships", (_req, res) => {
    const fleet = mirror.get<FleetState>(storeKeys.fleet);
    res.json(fleet?.ships.map(compactShip) ?? []);
  });

  app.get("/api/contracts", (_req, res) => {
    res.json((mirror.get<Contract[]>(storeKeys.contracts) ?? []).map(contractSummary));
  });

  app.get("/api/universe", (_req, res) => {
    const fleet = mirror.get<FleetState>(storeKeys.fleet);
    const shipAt = new Map<string, string[]>();
    for (const s of fleet?.ships ?? []) {
      const list = shipAt.get(s.nav.waypointSymbol) ?? [];
      list.push(s.symbol);
      shipAt.set(s.nav.waypointSymbol, list);
    }
    const systemsBySymbol = new Map<string, Pick<System, "symbol"> & Partial<Pick<System, "x" | "y">>>();
    for (const entry of mirror.listPrefix<System>(storeKeys.system("").slice(0, -1))) {
      if (entry.key.includes(":") && !entry.key.startsWith("system-waypoints:")) systemsBySymbol.set(entry.value.symbol, entry.value);
    }
    const waypointsBySystem = new Map<string, (ReturnType<typeof compactWaypoint> & { ships: string[] })[]>();
    for (const entry of mirror.listPrefix<Waypoint[]>("system-waypoints:")) {
      const system = entry.key.split(":")[1] ?? "";
      waypointsBySystem.set(system, entry.value.map(w => ({ ...compactWaypoint(w), ships: shipAt.get(w.symbol) ?? [] })));
      if (!systemsBySymbol.has(system)) systemsBySymbol.set(system, { symbol: system });
    }
    res.json({
      systems: [...systemsBySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
      waypointsBySystem: Object.fromEntries(waypointsBySystem),
      inTransit: (fleet?.ships ?? [])
        .filter(s => s.nav.status === "IN_TRANSIT")
        .map(s => ({ symbol: s.symbol, from: s.nav.route.origin.symbol, to: s.nav.route.destination.symbol, arrival: s.nav.route.arrival })),
    });
  });

  // Latest snapshot per market (whatever the agent last fetched) — the
  // markets page derives spreads and trade opportunities from these.
  app.get("/api/markets", (_req, res) => {
    const markets = mirror.listPrefix<Market>("market:").map(e => ({ ...compactMarket(e.value), fetchedAt: e.fetchedAt }));
    res.json(markets.sort((a, b) => a.symbol.localeCompare(b.symbol)));
  });

  app.get("/api/credits", (req, res) => {
    const since = Number(req.query.since);
    res.json(creditHistory.since(Number.isFinite(since) && since > 0 ? since : Date.now() - 7 * 24 * 3600_000));
  });

  app.get("/api/markets/history", (req, res) => {
    const q: { good?: string; waypoint?: string; limit?: number; cap?: number } = { cap: 3_000 };
    if (typeof req.query.good === "string" && req.query.good) q.good = req.query.good;
    if (typeof req.query.waypoint === "string" && req.query.waypoint) q.waypoint = req.query.waypoint;
    const limit = Number(req.query.limit);
    if (Number.isFinite(limit) && limit > 0 && limit <= 60) q.limit = limit;
    res.json(prices.query(q));
  });

  app.get("/api/tools", (_req, res) => res.json(toolCatalogJson()));

  app.get("/api/activity", (req, res) => {
    const q: { tool?: string; outcome?: ToolOutcome; wake?: number; since?: number; limit?: number } = {};
    if (typeof req.query.tool === "string" && req.query.tool) q.tool = req.query.tool;
    if (typeof req.query.outcome === "string" && (TOOL_OUTCOMES as readonly string[]).includes(req.query.outcome)) {
      q.outcome = req.query.outcome as ToolOutcome;
    }
    const wake = Number(req.query.wake);
    if (Number.isInteger(wake) && wake > 0) q.wake = wake;
    const since = Number(req.query.since);
    if (Number.isFinite(since) && since > 0) q.since = since;
    const limit = Number(req.query.limit);
    if (Number.isFinite(limit) && limit > 0 && limit <= 1000) q.limit = limit;
    res.json(activity.query(q));
  });

  app.get("/api/summaries", (req, res) => {
    const limit = Number(req.query.limit);
    res.json(summaries.recent(Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 30).reverse());
  });
  app.get("/api/plan", (_req, res) => res.json(checkpointStore.current));

  app.get("/api/memory", (_req, res) =>
    res.json({
      notes: memory.notes.filter(n => !n.archived).slice(-100),
      goals: memory.goals,
    }),
  );

  app.post("/api/memory/goals", (req, res) => {
    const { description, deadline } = req.body ?? {};
    if (typeof description !== "string" || !description.trim() || description.length > 2000) {
      res.status(400).json({ error: "description required (max 2000 chars)" });
      return;
    }
    res.json(memory.setGoal(description, typeof deadline === "string" ? deadline : undefined));
  });

  app.post("/api/memory/goals/:id/complete", (req, res) => {
    const goal = memory.completeGoal(req.params.id!);
    if (!goal) res.status(404).json({ error: "goal not found" });
    else res.json(goal);
  });

  app.post("/api/agent/pause", (_req, res) => {
    bus.emit({ type: "Command", ts: Date.now(), command: "pause" });
    res.json({ paused: true });
  });
  app.post("/api/agent/resume", (_req, res) => {
    bus.emit({ type: "Command", ts: Date.now(), command: "resume" });
    res.json({ paused: false });
  });
  app.post("/api/agent/wake", (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "manual wake from panel";
    bus.emit({ type: "Command", ts: Date.now(), command: "wake", reason });
    res.json({ ok: true });
  });
  app.post("/api/agent/directive", (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const trimmed = text.trim() ? text.slice(0, 2000) : null;
    bus.emit({ type: "Command", ts: Date.now(), command: "directive", text: trimmed ?? undefined });
    res.json({ directive: trimmed });
  });

  // Revalidate panel assets on every load so a harness update never leaves a
  // browser running a stale app.js/app.css (ETags keep it cheap).
  app.use(express.static(path.join(__dirname, "public"), { setHeaders: res => res.setHeader("Cache-Control", "no-cache") }));

  const server = app.listen(config.panelPort, config.panelHost, () => {
    console.log(`[panel] http://${config.panelHost}:${config.panelPort}`);
  });
  server.on("error", err => {
    console.error(`[panel] listen failed on ${config.panelHost}:${config.panelPort}:`, err.message);
    process.exit(1);
  });
}
