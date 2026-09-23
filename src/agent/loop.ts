import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { activity } from "../state/activity.js";
import { memory } from "../state/memory.js";
import { summaries } from "../state/summaries.js";
import { checkpointStore, type AgentPlan } from "../state/checkpoint.js";
import { refreshAgent, refreshContracts, refreshFleet } from "../state/refresh.js";
import { runtime } from "../state/runtime.js";
import { getTool, toolSpecs } from "../tools/registry.js";
import { executeTool, type ExecOutcome } from "../tools/executor.js";
import { scheduler, type Wakeup } from "./scheduler.js";
import { chat, extractJson, type ChatMessage } from "./llm.js";
import { compactShip } from "../state/projections.js";
import type { Agent, Contract } from "../generated/types.js";

const SYSTEM_PROMPT = `You are the decision core of a SpaceTraders agent. You control a fleet of ships via tools. You are fully autonomous — no human will approve or intervene.

How you work:
- Reason freely in your reply text. Act by calling tools — batch as many as you like per turn; the harness executes them with bounded concurrency and rate-limits the API for you. Results come back each round and you think again.
- This conversation is your working memory for the whole wake: every tool call and result stays in context. Before re-fetching data, check what you already have — identical repeat reads are answered from cache without hitting the API.
- You decide when the wake ends: call end_loop when there is nothing more worth doing — optionally with wakeAt (ISO) to choose the next wake time. Ship arrivals and cooldowns are auto-scheduled from tool results regardless.
- Guards fail locally at zero cost — read the reason and adapt (dock/orbit first, fetch market/waypoint data, refuel).

Rules:
- Use remember() to persist lessons (good trade routes, prices, strategy), set_goal for durable objectives.
- Contracts: deliver goods then fulfill when complete. Watch deadlines.
- Manage fuel proactively: refuel before long routes (guards verify live state).`;

interface WorkingMemory {
  time: string;
  reason: string;
  directive: string | null;
  policy: string;
  agent: Agent | null;
  agentAsOf: string | null;
  fleet: { asOf: string; ships: unknown[] };
  contracts: { asOf: string; items: unknown[] };
  goals: unknown[];
  notes: unknown[];
  recentSummaries: unknown[];
  rateBudget: { remaining: number | null; limit: number | null };
  alerts: string[];
}

async function buildWorkingMemory(reason: string): Promise<WorkingMemory> {
  const [agent, ships, contracts] = await Promise.all([refreshAgent(), refreshFleet(), refreshContracts()]);
  const alerts: string[] = [];
  if (!agent) alerts.push("agent data unavailable (API refresh failed) — retry get_my_agent before spending credits");
  if (!ships) alerts.push("fleet data unavailable (API refresh failed) — verify with list_ships before acting");
  if (!contracts) alerts.push("contracts data unavailable (API refresh failed)");

  const now = new Date().toISOString();
  for (const s of ships ?? []) {
    if (s.fuel && s.fuel.capacity > 0 && s.fuel.current / s.fuel.capacity < 0.2) {
      alerts.push(`${s.symbol} fuel low (${s.fuel.current}/${s.fuel.capacity})`);
    }
  }
  for (const c of contracts ?? []) {
    if (c.accepted && !c.fulfilled) {
      const terms = (c.terms as Contract["terms"]);
      const remaining = (terms.deliver ?? []).filter(d => d.unitsFulfilled < d.unitsRequired).length;
      alerts.push(`contract ${c.id.slice(0, 8)} accepted, ${remaining} deliverable(s) unfinished`);
    }
    if (!c.accepted && c.deadlineToAccept && Date.parse(c.deadlineToAccept) < Date.now() + 24 * 3600_000) {
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
    fleet: {
      asOf: ships ? now : "unavailable",
      ships: (ships ?? []).map(compactShip),
    },
    contracts: {
      asOf: contracts ? now : "unavailable",
      items: contracts ?? [],
    },
    goals: memory.activeGoals(),
    notes: memory.recall(undefined, undefined, 8).map(n => ({ id: n.id, kind: n.kind, content: n.content, tags: n.tags })),
    recentSummaries: summaries.recent(3).map(s => ({ wake: s.wake, text: s.text })),
    rateBudget: { remaining: runtime.rate.remaining, limit: runtime.rate.limit },
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
  calls: PlannedCall[];
  message: ChatMessage;
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

  const message: ChatMessage = {
    role: "assistant",
    content: thought || null,
    ...(calls.length
      ? {
          tool_calls: calls.map(c => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.tool, arguments: JSON.stringify(c.args ?? {}) },
          })),
        }
      : {}),
  };
  return { thought, calls, message };
}

const MAX_TOOL_RESULT_CHARS = 3_000;
const MAX_CONTEXT_CHARS = 150_000;
const ELIDED = "[elided for context budget]";

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
  const payload = o.outcome === "ok"
    ? { summary: o.summary, result: o.result ?? null }
    : { outcome: o.outcome, summary: o.summary };
  let content = JSON.stringify(payload);
  if (content.length > MAX_TOOL_RESULT_CHARS) content = content.slice(0, MAX_TOOL_RESULT_CHARS) + "…[truncated]";
  return { role: "tool", tool_call_id: callId, content };
}

function elideOldToolResults(messages: ChatMessage[]): void {
  const size = () => messages.reduce((n, m) => n + JSON.stringify(m).length, 0);
  for (const m of messages) {
    if (size() <= MAX_CONTEXT_CHARS) return;
    if (m.role !== "tool" || m.content === ELIDED) continue;
    m.content = ELIDED;
  }
}

function recordCachedOutcome(outcome: ExecOutcome, args: unknown): void {
  activity.append({
    kind: "tool",
    tool: outcome.tool,
    args,
    outcome: outcome.outcome,
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
    scheduler.schedule(Date.now() + 5000, "requeue: loop busy", wakeup.scope);
    return;
  }
  running = true;
  let wakeId = 0;
  try {
    wakeId = summaries.nextWakeId();
    bus.emit({ type: "AgentWoke", ts: Date.now(), reason: wakeup.reason, scope: wakeup.scope });
    activity.append({ kind: "wake", text: `wake #${wakeId}: ${wakeup.reason} (scope ${wakeup.scope})` });

    const outcomes: ExecOutcome[] = [];
    const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    const readCache = new Map<string, unknown>();
    let plan: AgentPlan | null = null;
    let actionsLeft = config.agent.maxActionsPerWake;
    let noCallRounds = 0;
    const runCall = async (call: PlannedCall): Promise<ExecOutcome> => {
      const def = getTool(call.tool);
      if (def?.kind !== "read") return executeTool(call.tool, call.args ?? {});
      const norm = def.input.safeParse(call.args ?? {});
      const key = norm.success ? `${call.tool}|${stableKey(norm.data)}` : null;
      if (key && readCache.has(key)) {
        const outcome: ExecOutcome = {
          tool: call.tool,
          outcome: "ok",
          summary: "cached: identical read already executed this wake — result re-sent, no API call",
          result: readCache.get(key),
        };
        recordCachedOutcome(outcome, call.args ?? {});
        return outcome;
      }
      const outcome = await executeTool(call.tool, call.args ?? {});
      if (key && outcome.outcome === "ok") readCache.set(key, outcome.result);
      return outcome;
    };

    let round = 0;
    while (round < config.agent.maxRoundsPerWake && actionsLeft > 0) {
      // Working memory seeds the conversation once per wake; afterwards the
      // conversation itself carries everything asked and learned, and live
      // state arrives via tool results.
      if (round === 0) {
        let wmString: string;
        try {
          wmString = JSON.stringify(await buildWorkingMemory(wakeup.reason), null, 1);
        } catch (err) {
          activity.append({ kind: "system", text: `working memory refresh failed: ${err instanceof Error ? err.message : err}` });
          break;
        }
        messages.push({ role: "user", content: `WORKING MEMORY:\n${wmString}\n\nWhat's next?` });
      } else {
        elideOldToolResults(messages);
      }
      let response: PlanResponse;
      try {
        response = await think(messages);
      } catch (err) {
        activity.append({ kind: "system", text: `LLM error: ${err instanceof Error ? err.message : err}` });
        break;
      }
      messages.push(response.message);
      plan = { thought: response.thought, calls: response.calls.map(c => ({ tool: c.tool, args: c.args })) };
      bus.emit({ type: "PlanUpdated", ts: Date.now(), thought: response.thought, calls: plan.calls });
      if (!response.calls.length) {
        // Pure reasoning turn — allow one, stop after two in a row.
        if (++noCallRounds >= 2) break;
        messages.push({
          role: "user",
          content: `No tool calls received. ${response.thought ? `You said: "${response.thought.slice(0, 300)}"` : ""}\nCall tools to act, or end_loop to finish.`,
        });
        round++;
        continue;
      }
      noCallRounds = 0;

      // Bounded-concurrency execution of the round's calls. Per-ship locks and
      // the transport's rate limiter serialize what must be serialized.
      const slots: (ExecOutcome | null)[] = new Array(response.calls.length).fill(null);
      let next = 0;
      let ended = false;
      const worker = async (): Promise<void> => {
        for (;;) {
          if (ended) return;
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
            return;
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
      // Every executed call gets a tool message so the model sees the result.
      // Calls after end_loop never started; their ids go unanswered, but the
      // conversation is over so no further completion references them.
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
      if (ended) break;
    }

    const text = summarizeWake(outcomes);
    summaries.add(wakeup.reason, text, outcomes.map(o => ({ tool: o.tool, outcome: o.outcome })));
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
    if (!scheduler.paused && scheduler.pending().length === 0) {
      scheduler.schedule(Date.now() + config.agent.fallbackWakeMs, "fallback periodic wake");
    }
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
