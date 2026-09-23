import { z } from "zod";
import { registerTool } from "./registry.js";
import { memory } from "../state/memory.js";
import { prices } from "../state/prices.js";
import { runtime } from "../state/runtime.js";
import { clampWakeAt } from "../utils/time.js";
import { systemOf } from "../utils/symbols.js";

registerTool({
  name: "end_loop",
  description: "Finish this wake. Optionally pass wakeAt (ISO timestamp) to schedule the next wake at a time you choose (ship arrivals and cooldowns are auto-scheduled from tool results regardless). Without wakeAt, a periodic fallback wake covers you. Use freely — call it as soon as there is nothing more worth doing this wake.",
  kind: "internal",
  input: z.object({ wakeAt: z.string().optional(), reason: z.string().optional() }),
  rateCost: 0,
  handler: async ({ wakeAt, reason }) => {
    if (wakeAt !== undefined) {
      const t = Date.parse(wakeAt);
      const at = Number.isFinite(t) ? clampWakeAt(t) : clampWakeAt(Date.now() + 60_000);
      return {
        summary: `loop finished; next wake ${new Date(at).toISOString()}${reason ? ` (${reason})` : ""}`,
        result: { ended: true, nextWakeAt: new Date(at).toISOString() },
        followUpWakeAt: at,
        followUpReason: reason ?? "agent-scheduled wake",
      };
    }
    return {
      summary: `loop finished${reason ? `: ${reason}` : ""}`,
      result: { ended: true },
    };
  },
});

registerTool({
  name: "remember",
  description: "Persist a durable note for future loops. kind: fact | observation | strategy | todo. importance 1-5.",
  kind: "internal",
  input: z.object({
    content: z.string(),
    kind: z.enum(["fact", "observation", "strategy", "todo"]).default("fact"),
    tags: z.array(z.string()).default([]),
    importance: z.number().int().min(1).max(5).default(3),
  }),
  rateCost: 0,
  handler: async ({ content, kind, tags, importance }) => {
    const note = memory.remember(content, kind, tags, importance);
    return { summary: `noted (${kind}): ${content.slice(0, 80)}`, result: { id: note.id } };
  },
});

registerTool({
  name: "recall",
  description: "Search your persisted notes by query text and/or tags.",
  kind: "internal",
  input: z.object({ query: z.string().optional(), tags: z.array(z.string()).optional() }),
  rateCost: 0,
  handler: async ({ query, tags }) => {
    const notes = memory.recall(query, tags, 10);
    return { summary: `${notes.length} notes`, result: notes.map(n => ({ id: n.id, kind: n.kind, content: n.content, tags: n.tags })) };
  },
});

registerTool({
  name: "forget",
  description: "Archive a note by id, or all notes with a tag.",
  kind: "internal",
  input: z.object({ idOrTag: z.string() }),
  rateCost: 0,
  handler: async ({ idOrTag }) => {
    const n = memory.forget(idOrTag);
    return { summary: `archived ${n} note(s)`, result: { archived: n } };
  },
});

registerTool({
  name: "set_goal",
  description: "Set a durable goal injected into every future wake (e.g. 'reach 500k credits', deadline optional ISO date).",
  kind: "internal",
  input: z.object({ description: z.string(), deadline: z.string().optional() }),
  rateCost: 0,
  handler: async ({ description, deadline }) => {
    const goal = memory.setGoal(description, deadline);
    return { summary: `goal set: ${description}`, result: goal };
  },
});

registerTool({
  name: "complete_goal",
  description: "Mark a goal completed (by id from working memory).",
  kind: "internal",
  input: z.object({ goalId: z.string() }),
  rateCost: 0,
  handler: async ({ goalId }) => {
    const goal = memory.completeGoal(goalId);
    return { summary: goal ? `goal ${goalId} completed` : `unknown goal ${goalId}`, result: goal ?? null };
  },
});

registerTool({
  name: "get_rate_budget",
  description: "Remaining API requests in the current rate window (limit is ~2/s).",
  kind: "internal",
  input: z.object({}).strict(),
  rateCost: 0,
  handler: async () => ({
    summary: `rate: ${runtime.rate.remaining ?? "?"} remaining of ${runtime.rate.limit ?? "?"}`,
    result: { ...runtime.rate },
  }),
});

registerTool({
  name: "get_market_memory",
  description: "Harness-local price history (the API has no history). Query by good symbol and/or waypoint; returns recent points and best buy/sell seen.",
  kind: "internal",
  input: z.object({ good: z.string().optional(), waypoint: z.string().optional(), limit: z.number().int().min(1).max(60).default(15) }),
  rateCost: 0,
  handler: async ({ good, waypoint, limit }) => {
    const points = prices.query({ good, waypoint, limit });
    const best = good ? prices.bestPrices(good) : {};
    return {
      summary: `${points.length} price points${good ? ` for ${good}` : ""}`,
      result: { points, best },
    };
  },
});

registerTool({
  name: "plan_route",
  description: "Estimate fuel/distance for a route (same system) from live waypoint data. Cross-system routes need warp/jump instead.",
  kind: "internal",
  input: z.object({ shipSymbol: z.string(), toWaypoint: z.string() }),
  rateCost: 3,
  handler: async ({ shipSymbol, toWaypoint }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    if (!ship) return { summary: `unknown ship ${shipSymbol} (list_ships first)`, result: null };
    const destSystem = systemOf(toWaypoint);
    if (destSystem !== ship.nav.systemSymbol) {
      return { summary: `${toWaypoint} is in ${destSystem}, ship is in ${ship.nav.systemSymbol} — use warp or jump`, result: { crossSystem: true } };
    }
    const from = await ctx.fresh.waypoint(systemOf(ship.nav.waypointSymbol), ship.nav.waypointSymbol);
    const to = await ctx.fresh.waypoint(destSystem, toWaypoint);
    if (!from || !to) {
      return { summary: `waypoint data unavailable for ${!from ? ship.nav.waypointSymbol : toWaypoint}`, result: null };
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    return {
      summary: `${from.symbol} → ${to.symbol}: distance ${Math.round(dist)}, fuel ~${Math.ceil(dist)} (CRUISE) / ~${Math.ceil(dist * 2)} (BURN) / 0 (DRIFT); ship fuel ${ship.fuel.current}/${ship.fuel.capacity}`,
      result: { distance: dist, fuelCruise: Math.ceil(dist), fuelBurn: Math.ceil(dist * 2), fuelDrift: 0, currentFuel: ship.fuel.current },
    };
  },
});
