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
import { usage } from "../state/usage.js";
import { prices, type PricePoint } from "../state/prices.js";
import { atlas } from "../state/atlas.js";
import { galaxy, toRow } from "../state/galaxy.js";
import { routines, describeSpec } from "../state/routines.js";
import { earnings, type ShipEarnings } from "../state/earnings.js";
import { shipyards } from "../state/shipyards.js";
import { creditHistory } from "../state/credits.js";
import { currentServer } from "../state/universe.js";
import { toolCatalogJson } from "../tools/registry.js";
import { compactShip, compactWaypoint, contractSummary } from "../state/projections.js";
import { config } from "../config.js";
import type { Contract, Market, Shipyard, System, Waypoint } from "../generated/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Per-ship earnings scan the whole event log, so /api/state (polled on every
// flush) reuses a summary for a few seconds.
let earningsCache: { at: number; key: string; rows: Map<string, ShipEarnings> } | null = null;
function shipEarnings(ships: string[]): Map<string, ShipEarnings> {
  const key = ships.join(",");
  if (!earningsCache || earningsCache.key !== key || Date.now() - earningsCache.at > 10_000) {
    earningsCache = { at: Date.now(), key, rows: new Map(earnings.summary(ships).map(e => [e.ship, e])) };
  }
  return earningsCache.rows;
}

/** Routine per ship for the panel: running ones, and stopped ones for an hour after they end. */
function panelRoutines() {
  const cutoff = Date.now() - 3600_000;
  return routines.all()
    .filter(r => r.status === "running" || r.updatedAt >= cutoff)
    .map(r => ({ ship: r.ship, spec: r.spec, label: describeSpec(r.spec), status: r.status, phase: r.phase, trips: r.trips, profit: r.profit, startedAt: r.startedAt, updatedAt: r.updatedAt, endReason: r.endReason }));
}

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
    const earned = shipEarnings(fleet?.ships.map(s => s.symbol) ?? []);
    res.json({
      agent: mirror.get(storeKeys.agent) ?? null,
      fleet: fleet?.ships.map(s => {
        const e = earned.get(s.symbol);
        return { ...compactShip(s), earnings: e ? { lastHour: e.lastHour, last24h: e.last24h, total: e.total, perHour: e.perHour, boughtFor: e.boughtFor, paybackHours: e.paybackHours } : null };
      }) ?? [],
      routines: panelRoutines(),
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
      /** LLM and API usage summed across restarts (llm / requestsTotal are since this start). */
      usage: usage.totals(),
      server: (() => {
        const sv = currentServer();
        return sv ? { nextReset: sv.nextReset, resetFrequency: sv.resetFrequency, leaderboards: sv.leaderboards, fetchedAt: sv.fetchedAt } : null;
      })(),
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
    type PanelWaypoint = { symbol: string; [field: string]: unknown };
    const waypointsBySystem = new Map<string, PanelWaypoint[]>();
    for (const entry of mirror.listPrefix<Waypoint[]>("system-waypoints:")) {
      const system = entry.key.split(":")[1] ?? "";
      waypointsBySystem.set(system, entry.value.map(w => ({ ...compactWaypoint(w), ships: shipAt.get(w.symbol) ?? [] })));
      if (!systemsBySymbol.has(system)) systemsBySymbol.set(system, { symbol: system });
    }
    // The atlas also knows waypoints the collector scouted by trait (shipyards,
    // markets) in systems whose full list was never read; show those too.
    for (const sys of atlas.allSystems()) {
      const known = atlas.inSystem(sys.symbol);
      if (!known.length) continue;
      const list = waypointsBySystem.get(sys.symbol) ?? [];
      const have = new Set(list.map(w => w.symbol));
      for (const w of known) {
        if (!have.has(w.symbol)) list.push({ symbol: w.symbol, type: w.type, x: w.x, y: w.y, traits: w.traits, isUnderConstruction: w.underConstruction ?? false, ships: shipAt.get(w.symbol) ?? [] });
      }
      waypointsBySystem.set(sys.symbol, list);
      if (!systemsBySymbol.has(sys.symbol)) systemsBySymbol.set(sys.symbol, { symbol: sys.symbol, x: sys.x, y: sys.y });
    }

    // Per-waypoint extras the harness remembers (panel only): live modifiers,
    // jump gate construction, ship offers and what each shipyard builds.
    const extras: Record<string, { modifiers?: string[]; modifiersAt?: number; construction?: unknown; shipyard?: unknown }> = {};
    const extra = (sym: string) => (extras[sym] ??= {});
    for (const list of waypointsBySystem.values()) {
      for (const w of list) {
        const known = atlas.get(w.symbol);
        if (known?.modifiers?.length) Object.assign(extra(w.symbol), { modifiers: known.modifiers, modifiersAt: known.modifiersAt });
        const c = atlas.construction(w.symbol);
        if (c) extra(w.symbol).construction = c;
      }
    }
    const offersAt = new Map<string, { type: string; price: number; supply: string; cargo?: number | undefined; speed?: number | undefined; ts: number }[]>();
    for (const o of shipyards.all()) (offersAt.get(o.waypoint) ?? offersAt.set(o.waypoint, []).get(o.waypoint)!).push({ type: o.type, price: o.price, supply: o.supply, cargo: o.cargo, speed: o.speed, ts: o.ts });
    for (const { value: y } of mirror.listPrefix<Shipyard>("shipyard:")) {
      extra(y.symbol).shipyard = { types: (y.shipTypes ?? []).map(t => t.type), offers: (offersAt.get(y.symbol) ?? []).sort((a, b) => a.price - b.price) };
      offersAt.delete(y.symbol);
    }
    for (const [wp, offers] of offersAt) extra(wp).shipyard = { types: offers.map(o => o.type), offers: offers.sort((a, b) => a.price - b.price) };
    res.json({
      galaxy: galaxy.status(),
      gateLinks: atlas.gateLinks(),
      intel: atlas.systemIntel(),
      systems: [...systemsBySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
      waypointsBySystem: Object.fromEntries(waypointsBySystem),
      extras,
      inTransit: (fleet?.ships ?? [])
        .filter(s => s.nav.status === "IN_TRANSIT")
        .map(s => ({ symbol: s.symbol, from: s.nav.route.origin.symbol, to: s.nav.route.destination.symbol, arrival: s.nav.route.arrival })),
    });
  });

  // Every system's position and star type for the galaxy map (panel only; the
  // agent never sees it). Systems the atlas read itself fill in while the full
  // list is still loading.
  app.get("/api/galaxy", (_req, res) => {
    const rows = new Map(galaxy.rows().map(r => [r[0], r]));
    for (const s of atlas.allSystems()) {
      if (!rows.has(s.symbol)) rows.set(s.symbol, toRow(s, Object.values(s.waypointTypes).reduce((n, c) => n + c, 0)));
    }
    res.json({ ...galaxy.status(), systems: [...rows.values()] });
  });

  // Latest snapshot per market (whatever the agent last fetched) — the
  // markets page derives spreads and trade opportunities from these.
  // The panel keeps the API's purchasePrice/sellPrice names (the agent's
  // compactMarket renames them youPay/youGet). A market read with no ship
  // present lists no prices, so those fall back to the last prices the price
  // store recorded there, marked with when they were seen.
  app.get("/api/markets", (_req, res) => {
    const lastSeen = new Map<string, PricePoint[]>();
    for (const p of prices.latest()) (lastSeen.get(p.waypoint) ?? lastSeen.set(p.waypoint, []).get(p.waypoint)!).push(p);
    const fromHistory = (points: PricePoint[]) => ({
      tradeGoods: points
        .map(p => ({ symbol: p.good, type: p.type ?? "EXCHANGE", supply: p.supply, activity: p.activity, purchasePrice: p.purchasePrice, sellPrice: p.sellPrice, tradeVolume: p.volume }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
      pricesAt: Math.max(...points.map(p => p.ts)),
    });
    const out = new Map<string, Record<string, unknown>>();
    for (const { value: m, fetchedAt } of mirror.listPrefix<Market>("market:")) {
      const base = { symbol: m.symbol, fetchedAt, exports: m.exports.map(g => g.symbol), imports: m.imports.map(g => g.symbol), exchange: m.exchange.map(g => g.symbol) };
      if (m.tradeGoods?.length) {
        out.set(m.symbol, {
          ...base,
          tradeGoods: m.tradeGoods.map(g => ({ symbol: g.symbol, type: g.type, supply: g.supply, activity: g.activity, purchasePrice: g.purchasePrice, sellPrice: g.sellPrice, tradeVolume: g.tradeVolume })),
          pricesAt: fetchedAt,
          live: true,
        });
      } else {
        const seen = lastSeen.get(m.symbol);
        out.set(m.symbol, seen?.length ? { ...base, ...fromHistory(seen) } : { ...base, note: "No prices seen yet: a ship has to be at this market to read them." });
      }
    }
    for (const [wp, points] of lastSeen) {
      if (!out.has(wp)) out.set(wp, { symbol: wp, fetchedAt: Math.max(...points.map(p => p.ts)), exports: [], imports: [], exchange: [], ...fromHistory(points) });
    }
    res.json([...out.values()].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol))));
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
    // Reasoning can be long; only the per-wake transcript needs it.
    const entries = activity.query(q);
    res.json(q.wake === undefined ? entries.map(({ reasoning: _r, ...e }) => e) : entries);
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
