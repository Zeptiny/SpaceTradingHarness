import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { activity } from "../state/activity.js";
import { memory } from "../state/memory.js";
import { summaries } from "../state/summaries.js";
import { checkpointStore, type AgentPlan } from "../state/checkpoint.js";
import { refreshAgent, refreshContracts, refreshFleet, scanShipLocations } from "../state/refresh.js";
import { atlas, type GateSummary } from "../state/atlas.js";
import { ledger, type Trend } from "../state/ledger.js";
import { computeTradeLeads, prices, type TradeLead } from "../state/prices.js";
import { runtime } from "../state/runtime.js";
import { getTool, toolSpecs } from "../tools/registry.js";
import { executeTool, type ExecOutcome } from "../tools/executor.js";
import { scheduler, type Wakeup } from "./scheduler.js";
import { chat, extractJson, type ChatMessage } from "./llm.js";
import { compactShip, contractSummary, isContractOpen } from "../state/projections.js";
import { shipyards } from "../state/shipyards.js";
import { creditHistory } from "../state/credits.js";
import type { WakeStats } from "../state/summaries.js";
import type { Agent, Ship } from "../generated/types.js";

const SYSTEM_PROMPT = `You are the decision core of a SpaceTraders agent. You control a fleet of ships via tools. You are fully autonomous — no human will approve or intervene.

Mission: grow the fleet and the income rate as fast as possible. Net worth (ships + credits) is the score, not the bank balance. Credits sitting above the reserve are idle capital — convert them into ships that earn.

How you work:
- Reason freely in your reply text. Act by calling tools — batch as many as you like per turn; the harness executes them with bounded concurrency and rate-limits the API for you. Results come back each round and you think again.
- This conversation is your working memory for the whole wake: every tool call and result stays in context. Before re-fetching data, check what you already have — identical repeat reads are answered from cache without hitting the API.
- You decide when the wake ends: call end_loop when there is nothing more worth doing — optionally with wakeAt (ISO) to choose the next wake time. Ship arrivals and cooldowns are auto-scheduled from tool results regardless.
- Guards fail locally before any action request is sent — read the reason and adapt (fetch market/waypoint data, refuel, move a ship to the shipyard). Guards read live server state: a rejection is never stale cache or clock skew.
- Every tool result carries now (current time). A ship IN_TRANSIT or on cooldown cannot act until the time its rejection names; don't retry before then. Use wait_for_ship for short waits, otherwise give other ships work or end_loop.
- Identical reads within a wake are answered from cache for up to 30s, until you take an action or wait; after that, reads hit the API again.
- When you finish, call end_loop with a short summary for the human operator.

Strategy:
- Every ship works, every wake. Working memory tags each ship's state; any ship marked IDLE needs a job this wake (a probe you deliberately parked at a market or shipyard counts as working). Plan all ships together and batch their calls in the same turn — ships run in parallel, and an idle ship is lost income. Don't end the wake while a ship is idle and you can still act.
- Contracts: the game allows only ONE active contract at a time, so contracts can't scale. The moment one is fulfilled, negotiate the next (negotiate_contract with a ship at a faction waypoint, e.g. HQ) and accept it if it pays. Give contract work to one ship; the rest of the fleet earns elsewhere.
- Parallel income: (1) Trading — buy where a good is EXPORTed cheap, sell where it is IMPORTed dear; check tradeVolume per transaction and that margin × units clearly beats fuel. (2) Mining — mining drones / ore hounds extract at asteroid fields and sell (or hand off via transfer_cargo to a hauler). (3) Probes — cheap ships parked at markets and shipyards keep prices visible without spending fuel.
- Invest continuously. When economy.investable covers a ship's price, buy one. Default order when unsure: 1–2 probes early to map markets and shipyards; then light haulers for trading once you know a profitable route, or mining drones if an asteroid field with nearby buyers exists. Keep buying while payback looks good. purchase_ship needs one of your ships at the shipyard (that is also how prices get revealed; prices you've seen are in economy.knownShipOffers). Assign every new ship a job in the same wake.
- Keep the reserve (economy.reserve) for fuel, cargo capital and contract purchases; purchase_ship refuses buys that would dip below it.
- Working memory does the bookkeeping for you: economy.trend is your measured income (earned = credit change + ship spend), market.tradeLeads are the best buy-here/sell-there spreads from prices your ships have seen (refreshed at every waypoint where a ship sits), map lists known markets (with what each exports/imports), shipyards and asteroids with coordinates, gates lists your system's jump gate and the systems it connects to. The harness fills these in between wakes. Use them before spending calls on discovery; send a ship or probe to market.unpricedMarkets to widen coverage.
- Track what works: remember() profitable routes (good, buy at, sell at, margin) and ship payback; set_goal for fleet-size and credit targets and complete them as you pass them.

Game mechanics:
- Warp, jump and scan need the ship IN_ORBIT; repair and modify need it DOCKED (trade, refuel, deliver, negotiate, navigate, extract, siphon and survey switch automatically).
- Market and shipyard prices are only visible while one of your ships is at that waypoint; get_market_memory has prices seen earlier.
- Fuel: CRUISE ≈ distance, BURN ≈ 2× distance (faster), DRIFT = 1 fuel (very slow) — DRIFT rescues a ship too low on fuel to reach a market.
- Jump gates: gates[].connections lists neighbor systems with distance and, once scouted, their shipyards and market count. A gate under construction cannot be used (gates[].construction shows its progress). jump needs the ship in orbit at the gate and buys ANTIMATTER there. Expand to a neighbor when it offers something home lacks: a ship type you want, better trade, untouched asteroids.
- Working memory lists your limits for this wake; mutating actions count against maxActions.

Rules:
- Contracts: deliver goods then fulfill when complete. Watch deadlines.
- Manage fuel proactively: refuel before long routes (guards verify live state).
- Trade, refuel, deliver and negotiate auto-dock; navigate, extract, siphon and survey auto-orbit — no separate dock/orbit call needed.`;

interface WorkingMemory {
  time: string;
  reason: string;
  directive: string | null;
  policy: string;
  agent: Agent | null;
  agentAsOf: string | null;
  economy: {
    credits: number | null;
    reserve: number;
    investable: number | null;
    fleetSize: number;
    idleShips: string[];
    knownShipOffers: { type: string; price: number; waypoint: string; supply: string; seenMinutesAgo: number }[];
    trend: { lastHour: Trend | null; lastDay: Trend | null };
  };
  market: {
    scannedThisWake: string[];
    tradeLeads: TradeLead[];
    unpricedMarkets: string[];
  };
  map: ReturnType<typeof atlas.summary>;
  gates: GateSummary[];
  fleet: { asOf: string; ships: unknown[] };
  contracts: { asOf: string; items: unknown[]; closedCount: number };
  goals: unknown[];
  notes: unknown[];
  recentSummaries: unknown[];
  rateBudget: { remaining: number | null; limit: number | null };
  limits: { maxActions: number; maxRounds: number };
  alerts: string[];
}

async function buildWorkingMemory(reason: string): Promise<WorkingMemory> {
  const [agent, ships, contracts] = await Promise.all([refreshAgent(), refreshFleet(), refreshContracts()]);
  const alerts: string[] = [];
  if (!agent) alerts.push("agent data unavailable (API refresh failed) — retry get_my_agent before spending credits");
  if (!ships) alerts.push("fleet data unavailable (API refresh failed) — verify with list_ships before acting");
  if (!contracts) alerts.push("contracts data unavailable (API refresh failed)");

  // Harness-side collection before the agent thinks: price every market a
  // ship is sitting at and log the balance for the income trend.
  const scan = ships && config.agent.autoScanRequests > 0
    ? await scanShipLocations(ships, config.agent.autoScanRequests)
    : { markets: [], shipyards: [] };
  if (agent && ships) ledger.sample(agent.credits, ships.length);

  const now = new Date().toISOString();
  const shipState = (s: Ship): string => {
    if (s.nav.status === "IN_TRANSIT") return `IN_TRANSIT to ${s.nav.route.destination.symbol} until ${s.nav.route.arrival}`;
    if (s.cooldown.remainingSeconds > 0) return `COOLDOWN ${s.cooldown.remainingSeconds}s`;
    return `IDLE (${s.nav.status} at ${s.nav.waypointSymbol})`;
  };
  const idleShips = (ships ?? []).filter(s => shipState(s).startsWith("IDLE")).map(s => s.symbol);
  if (idleShips.length) alerts.push(`${idleShips.length} ship(s) idle: ${idleShips.join(", ")} — give each a job`);

  const reserve = config.agent.creditReserve;
  const investable = agent ? Math.max(0, agent.credits - reserve) : null;
  const offers = shipyards.cheapestByType().map(o => ({
    type: o.type,
    price: o.price,
    waypoint: o.waypoint,
    supply: o.supply,
    seenMinutesAgo: Math.round((Date.now() - o.ts) / 60_000),
  }));
  const affordable = investable === null ? [] : offers.filter(o => o.price <= investable);
  if (affordable.length) {
    alerts.push(`investable ${investable} cr covers: ${affordable.map(o => `${o.type} (${o.price} @ ${o.waypoint})`).join(", ")} — buy ships that will earn`);
  } else if (investable && !offers.length) {
    alerts.push(`${investable} cr investable but no ship prices known — find SHIPYARD waypoints (get_system_waypoints traitFilter SHIPYARD) and send a ship to read prices`);
  }

  const trend = { lastHour: ledger.trend(3600_000), lastDay: ledger.trend(24 * 3600_000) };
  if (trend.lastHour && trend.lastHour.windowHours >= 0.5 && trend.lastHour.earned <= 0) {
    alerts.push(`no net income over the last ${trend.lastHour.windowHours}h (earned ${trend.lastHour.earned} cr) — current jobs are not paying; change them`);
  }

  const latestPrices = prices.latest();
  const tradeLeads = computeTradeLeads(latestPrices, { distance: (a, b) => atlas.distance(a, b) });
  const fleetSystems = [...new Set((ships ?? []).map(s => s.nav.systemSymbol))];
  const priced = prices.marketsSeen();
  const unpricedMarkets = fleetSystems
    .flatMap(sys => atlas.inSystem(sys))
    .filter(w => w.traits.includes("MARKETPLACE") && !priced.has(w.symbol))
    .map(w => w.symbol);
  const unmapped = fleetSystems.filter(sys => !atlas.system(sys)?.mapped);
  if (unmapped.length) {
    alerts.push(`map of ${unmapped.join(", ")} incomplete — the harness maps it between wakes; call get_system_waypoints only if you need it this wake`);
  }
  const bestBuy = (good: string): { price: number; at: string } | null => {
    const src = latestPrices
      .filter(p => p.good === good && p.purchasePrice != null && p.type !== "IMPORT")
      .sort((a, b) => a.purchasePrice! - b.purchasePrice!)[0];
    return src ? { price: src.purchasePrice!, at: src.waypoint } : null;
  };

  for (const s of ships ?? []) {
    if (s.fuel && s.fuel.capacity > 0 && s.fuel.current / s.fuel.capacity < 0.2) {
      alerts.push(`${s.symbol} fuel low (${s.fuel.current}/${s.fuel.capacity})`);
    }
  }
  const openContracts = (contracts ?? []).filter(isContractOpen);
  if (contracts && !openContracts.length) {
    alerts.push("no open contract — negotiate one (negotiate_contract with a ship at a faction waypoint)");
  }
  for (const c of openContracts) {
    if (c.accepted) {
      const remaining = (c.terms.deliver ?? []).filter(d => d.unitsFulfilled < d.unitsRequired).length;
      const dueSoon = Date.parse(c.terms.deadline) < Date.now() + 24 * 3600_000 ? `, due ${c.terms.deadline}` : "";
      alerts.push(`contract ${c.id.slice(0, 8)} accepted, ${remaining} deliverable(s) unfinished${dueSoon}`);
    } else if (c.deadlineToAccept && Date.parse(c.deadlineToAccept) < Date.now() + 24 * 3600_000) {
      alerts.push(`contract ${c.id.slice(0, 8)} offer expires soon`);
    }
  }

  const wm: WorkingMemory = {
    time: now,
    reason,
    directive: scheduler.directive,
    policy: config.agent.policy,
    agent: agent ?? null,
    agentAsOf: agent ? now : null,
    economy: {
      credits: agent?.credits ?? null,
      reserve,
      investable,
      fleetSize: ships?.length ?? 0,
      idleShips,
      knownShipOffers: offers,
      trend,
    },
    market: {
      scannedThisWake: [...scan.markets, ...scan.shipyards.map(s => `${s} (shipyard)`)],
      tradeLeads,
      unpricedMarkets,
    },
    map: atlas.summary(fleetSystems),
    gates: atlas.gates(fleetSystems),
    fleet: {
      asOf: ships ? now : "unavailable",
      ships: (ships ?? []).map(s => ({ state: shipState(s), ...compactShip(s) })),
    },
    contracts: {
      asOf: contracts ? now : "unavailable",
      items: openContracts.map(c => {
        const summary = contractSummary(c);
        return { ...summary, deliverables: summary.deliverables.map(d => ({ ...d, knownCheapestSource: bestBuy(d.symbol) })) };
      }),
      closedCount: (contracts?.length ?? 0) - openContracts.length,
    },
    goals: memory.activeGoals(),
    notes: memory.recall(undefined, undefined, 8).map(n => ({ id: n.id, kind: n.kind, content: n.content, tags: n.tags })),
    recentSummaries: summaries.recent(3).map(s => ({ wake: s.wake, text: s.text })),
    rateBudget: { remaining: runtime.rate.remaining, limit: runtime.rate.limit },
    limits: {
      maxActions: Math.max(config.agent.maxActionsPerWake, config.agent.actionsPerShip * (ships?.length ?? 0)),
      maxRounds: config.agent.maxRoundsPerWake,
    },
    alerts,
  };
  return wm;
}

interface PlannedCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

interface PlanResponse {
  thought: string;
  reasoning: string | null;
  calls: PlannedCall[];
  message: ChatMessage;
  usage: { prompt: number; completion: number; cached: number };
}

async function think(messages: ChatMessage[]): Promise<PlanResponse> {
  const result = await chat(messages, { tools: toolSpecs() });
  const thought = result.content ?? "";
  let calls: PlannedCall[] = result.toolCalls.map((tc, i) => ({
    id: tc.id ?? `call_${Date.now()}_${i}`,
    tool: tc.name,
    args: tc.args,
  }));

  // Lenient fallback: some models answer in text instead of tool_calls.
  if (!calls.length && thought) {
    try {
      const parsed = extractJson(thought) as unknown;
      const raw = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { calls?: unknown }).calls)
          ? (parsed as { calls: unknown[] }).calls
          : null;
      if (raw) {
        calls = raw
          .filter((c): c is { tool: string; args?: Record<string, unknown> } =>
            !!c && typeof c === "object" && typeof (c as { tool?: unknown }).tool === "string")
          .map((c, i) => ({ id: `call_${Date.now()}_fallback${i}`, tool: c.tool, args: c.args ?? {} }));
      }
    } catch {
      // pure prose thought — no calls
    }
  }

  const message = {
    role: "assistant",
    content: thought || null,
    ...(config.llm.echoReasoning ? result.reasoningFields : {}),
    ...(calls.length
      ? {
          tool_calls: calls.map(c => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.tool, arguments: JSON.stringify(c.args ?? {}) },
          })),
        }
      : {}),
  } as ChatMessage;
  return { thought, reasoning: result.reasoning, calls, message, usage: result.usage };
}

// Tool results are compact projections (see state/projections.ts); the cap is
// a backstop for unusually large payloads, not the normal path.
const MAX_TOOL_RESULT_CHARS = 8_000;
const READ_CACHE_TTL_MS = 30_000;
const MAX_CONTEXT_CHARS = 150_000;
const ELIDED = "[elided for context budget]";
// Per-entry cap on reasoning kept in the activity log.
const MAX_LOGGED_REASONING_CHARS = 24_000;

function clipReasoning(r: string | null): string | undefined {
  if (!r) return undefined;
  return r.length > MAX_LOGGED_REASONING_CHARS
    ? `${r.slice(0, MAX_LOGGED_REASONING_CHARS)}…[${r.length - MAX_LOGGED_REASONING_CHARS} more chars not logged]`
    : r;
}

function stableKey(v: unknown): string {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => `${k}:${stableKey(x)}`)
      .join(",");
  }
  return JSON.stringify(v) ?? "null";
}

function toolMessageFor(callId: string, o: ExecOutcome): ChatMessage {
  // `now` gives the agent a clock: working memory's timestamp is only the
  // wake start, and arrivals/cooldowns are absolute server times.
  const now = new Date().toISOString();
  const payload = o.outcome === "ok"
    ? { now, summary: o.summary, result: o.result ?? null }
    : { now, outcome: o.outcome, summary: o.summary };
  let content = JSON.stringify(payload);
  if (content.length > MAX_TOOL_RESULT_CHARS) {
    content = `${content.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated ${content.length - MAX_TOOL_RESULT_CHARS} chars — request narrower data]`;
  }
  return { role: "tool", tool_call_id: callId, content };
}

function elideOldToolResults(messages: ChatMessage[]): void {
  let size = messages.reduce((n, m) => n + JSON.stringify(m).length, 0);
  for (const m of messages) {
    if (size <= MAX_CONTEXT_CHARS) return;
    if (m.role !== "tool" || m.content === ELIDED) continue;
    size -= JSON.stringify(m).length;
    m.content = ELIDED;
    size += JSON.stringify(m).length;
  }
}

function recordCachedOutcome(outcome: ExecOutcome, args: unknown): void {
  activity.append({
    kind: "tool",
    tool: outcome.tool,
    args,
    outcome: outcome.outcome,
    summary: outcome.summary,
    result: outcome.result,
    guards: [],
    requestsSpent: 0,
    durationMs: 0,
  });
  bus.emit({
    type: "ToolCalled",
    ts: Date.now(),
    tool: outcome.tool,
    args,
    outcome: outcome.outcome,
    summary: outcome.summary,
    requestsSpent: 0,
    durationMs: 0,
  });
}

let running = false;

export async function runWake(wakeup: Wakeup): Promise<void> {
  if (running) {
    // The scheduler holds wakes while busy, so this only catches a direct
    // call. Keep the original reason; it fires once the current wake ends.
    scheduler.schedule(Date.now(), wakeup.reason, wakeup.scope);
    return;
  }
  running = true;
  scheduler.setBusy(true);
  const startedAt = Date.now();
  const requestsAtStart = runtime.requestsTotal;
  const tokens = { prompt: 0, completion: 0, cached: 0 };
  let creditsStart: number | null = null;
  let endedBy: WakeStats["endedBy"] = "round-cap";
  let agentSummary: string | null = null;
  let round = 0;
  const outcomes: ExecOutcome[] = [];
  let wakeId = 0;
  try {
    wakeId = summaries.nextWakeId();
    runtime.wake = { id: wakeId, reason: wakeup.reason, startedAt, round: 0 };
    bus.emit({ type: "AgentWoke", ts: Date.now(), reason: wakeup.reason, scope: wakeup.scope });
    activity.append({ kind: "wake", text: `wake #${wakeId}: ${wakeup.reason} (scope ${wakeup.scope})` });

    const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    // Identical reads within a wake are served from here — but only until the
    // agent mutates game state (any executed action clears it so later reads
    // reflect the action), time moves on (entries expire, and wait_for_ship
    // clears it), since a ship read mid-transit goes stale on arrival.
    const readCache = new Map<string, { at: number; result: unknown }>();
    let plan: AgentPlan | null = null;
    // Sized once the fleet is known (round 0) so each ship can get a full job.
    let actionsLeft = config.agent.maxActionsPerWake;
    let noCallRounds = 0;
    const runCall = async (call: PlannedCall): Promise<ExecOutcome> => {
      const def = getTool(call.tool);
      if (def?.kind !== "read") {
        const outcome = await executeTool(call.tool, call.args ?? {});
        if (def?.kind === "action" && (outcome.outcome === "ok" || outcome.outcome === "api-error")) readCache.clear();
        if (call.tool === "wait_for_ship") readCache.clear();
        return outcome;
      }
      const norm = def.input.safeParse(call.args ?? {});
      const key = norm.success ? `${call.tool}|${stableKey(norm.data)}` : null;
      const hit = key ? readCache.get(key) : undefined;
      if (hit && Date.now() - hit.at < READ_CACHE_TTL_MS) {
        const outcome: ExecOutcome = {
          tool: call.tool,
          outcome: "ok",
          summary: `cached: identical read ${Math.round((Date.now() - hit.at) / 1000)}s ago (no action since) — result re-sent, no API call`,
          result: hit.result,
        };
        recordCachedOutcome(outcome, call.args ?? {});
        return outcome;
      }
      const outcome = await executeTool(call.tool, call.args ?? {});
      if (key && outcome.outcome === "ok") readCache.set(key, { at: Date.now(), result: outcome.result });
      return outcome;
    };

    while (round < config.agent.maxRoundsPerWake) {
      if (actionsLeft <= 0) {
        endedBy = "action-cap";
        break;
      }
      runtime.wake.round = round + 1;
      // Working memory seeds the conversation once per wake; afterwards the
      // conversation itself carries everything asked and learned, and live
      // state arrives via tool results.
      if (round === 0) {
        let wm: WorkingMemory;
        try {
          wm = await buildWorkingMemory(wakeup.reason);
          actionsLeft = wm.limits.maxActions;
        } catch (err) {
          activity.append({ kind: "system", text: `working memory refresh failed: ${err instanceof Error ? err.message : err}` });
          endedBy = "error";
          break;
        }
        creditsStart = wm.agent?.credits ?? null;
        messages.push({ role: "user", content: `WORKING MEMORY:\n${JSON.stringify(wm, null, 1)}\n\nWhat's next?` });
      } else {
        elideOldToolResults(messages);
      }
      let response: PlanResponse;
      try {
        response = await think(messages);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.llm.errors++;
        runtime.llm.lastError = msg;
        activity.append({ kind: "system", text: `LLM error: ${msg}` });
        endedBy = "llm-error";
        break;
      }
      runtime.llm.calls++;
      runtime.llm.promptTokens += response.usage.prompt;
      runtime.llm.completionTokens += response.usage.completion;
      runtime.llm.cachedTokens += response.usage.cached;
      tokens.prompt += response.usage.prompt;
      tokens.completion += response.usage.completion;
      tokens.cached += response.usage.cached;

      messages.push(response.message);
      if (response.thought.trim() || response.reasoning) {
        activity.append({ kind: "thought", text: response.thought.trim(), reasoning: clipReasoning(response.reasoning) });
      }
      plan = { thought: response.thought, calls: response.calls.map(c => ({ tool: c.tool, args: c.args })) };
      bus.emit({ type: "PlanUpdated", ts: Date.now(), thought: response.thought, calls: plan.calls });
      if (!response.calls.length) {
        // Pure reasoning turn — allow one, stop after two in a row.
        if (++noCallRounds >= 2) {
          endedBy = "no-tool-calls";
          break;
        }
        messages.push({
          role: "user",
          content: `No tool calls received. ${response.thought ? `You said: "${response.thought.slice(0, 300)}"` : ""}\nCall tools to act, or end_loop to finish.`,
        });
        round++;
        continue;
      }
      noCallRounds = 0;

      // Bounded-concurrency execution of the round's calls. Per-ship locks and
      // the transport's rate limiter serialize what must be serialized. The
      // whole batch runs even when it contains end_loop — the agent asked for
      // every call, and each one gets a tool result.
      const slots: (ExecOutcome | null)[] = new Array(response.calls.length).fill(null);
      let next = 0;
      let ended = false;
      const worker = async (): Promise<void> => {
        for (;;) {
          const idx = next++;
          if (idx >= response.calls.length) return;
          const call = response.calls[idx]!;
          const outcome = await runCall(call);
          slots[idx] = outcome;
          if (outcome.followUpWakeAt) {
            const args = (call.args ?? {}) as Record<string, unknown>;
            scheduler.schedule(
              outcome.followUpWakeAt,
              outcome.followUpReason ?? "tool follow-up",
              typeof args["shipSymbol"] === "string" ? String(args["shipSymbol"]) : "all",
            );
          }
          if (outcome.outcome === "ok" && outcome.tool === "end_loop") {
            ended = true;
            const s = (call.args as { summary?: unknown } | undefined)?.summary;
            if (typeof s === "string" && s.trim()) agentSummary = s.trim();
          }
        }
      };
      const workers = Array.from(
        { length: Math.max(1, Math.min(config.agent.maxConcurrentTools, response.calls.length)) },
        () => worker(),
      );
      await Promise.all(workers);
      const roundOutcomes = slots.filter((o): o is ExecOutcome => o !== null);
      outcomes.push(...roundOutcomes);
      for (let i = 0; i < slots.length; i++) {
        const o = slots[i];
        if (o) messages.push(toolMessageFor(response.calls[i]!.id, o));
      }
      // Only mutating actions consume the action budget; reads and internal
      // tools are free, as are guard-rejected / blocked / local errors, so the
      // agent can gather context and adapt without starving its action slots.
      const spent = roundOutcomes.filter(o =>
        getTool(o.tool)?.kind === "action" && (o.outcome === "ok" || o.outcome === "api-error"),
      ).length;
      actionsLeft -= spent;

      round++;
      if (ended) {
        endedBy = "end_loop";
        break;
      }
    }

    const details = summarizeWake(outcomes);
    const text = agentSummary ?? (outcomes.length ? details : endedEarlyText(endedBy));
    const stats: WakeStats = {
      startedAt,
      durationMs: Date.now() - startedAt,
      rounds: round,
      requests: runtime.requestsTotal - requestsAtStart,
      tokens,
      creditsStart,
      creditsEnd: creditHistory.latest()?.credits ?? creditsStart,
      endedBy,
    };
    summaries.add({
      reason: wakeup.reason,
      text,
      details: agentSummary ? details : undefined,
      actions: outcomes.map(o => ({ tool: o.tool, outcome: o.outcome })),
      stats,
    });
    bus.emit({ type: "LoopSummary", ts: Date.now(), wake: wakeId, text });
    activity.append({ kind: "summary", text });
    checkpointStore.save({ wakeId, reason: wakeup.reason, plan, resultsSummary: text });
    const archived = memory.consolidate();
    if (archived > 0) activity.append({ kind: "system", text: `memory: archived ${archived} stale observations` });
  } catch (err) {
    console.error("[loop] wake failed:", err);
    try {
      activity.append({ kind: "system", text: `wake error: ${err instanceof Error ? err.message : String(err)}` });
    } catch {
      // logging itself failing — nothing more we can do
    }
  } finally {
    running = false;
    runtime.wake = null;
    runtime.lastWakeEndedAt = Date.now();
    if (!scheduler.paused && scheduler.pending().length === 0) {
      scheduler.schedule(Date.now() + config.agent.fallbackWakeMs, "fallback periodic wake");
    }
    // Releases wakes that came due during this one, merged into a single wake.
    scheduler.setBusy(false);
  }
}

// A wake that did nothing must say why — a silent fleet is what makes an
// autonomous agent untrustworthy (ARCHITECTURE §6.3).
function endedEarlyText(endedBy: WakeStats["endedBy"]): string {
  switch (endedBy) {
    case "llm-error": return `no actions — LLM call failed: ${runtime.llm.lastError ?? "unknown error"}`;
    case "error": return "no actions — working memory refresh failed (see activity log)";
    case "no-tool-calls": return "no actions — the agent replied twice without calling a tool";
    default: return "no actions taken";
  }
}

function summarizeWake(outcomes: ExecOutcome[]): string {
  if (!outcomes.length) return "no actions taken";
  const ok = outcomes.filter(o => o.outcome === "ok").map(o => o.summary);
  const bad = outcomes.filter(o => o.outcome !== "ok").map(o => `${o.tool}(${o.outcome}): ${o.summary}`);
  const parts: string[] = [];
  if (ok.length) parts.push(ok.join("; "));
  if (bad.length) parts.push(`issues: ${bad.join("; ")}`);
  return parts.join(" | ") || "no-op";
}

export function startAgent(): void {
  scheduler.onWake(w => {
    void runWake(w);
  });
  bus.subscribe(e => {
    if (e.type === "Command") {
      if (e.command === "pause") scheduler.setPaused(true);
      else if (e.command === "resume") scheduler.setPaused(false);
      else if (e.command === "wake") scheduler.wakeNow(e.reason ?? "manual wake", { ignorePause: true });
      else if (e.command === "directive") scheduler.setDirective(e.text ?? null);
    }
  });
  if (scheduler.paused) {
    console.log("[agent] started PAUSED");
  } else {
    scheduler.schedule(Date.now() + 1500, "harness start");
  }
  console.log("[agent] started (policy: %s)", config.agent.policy);
}
