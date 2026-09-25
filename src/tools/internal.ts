import { z } from "zod";
import { registerTool } from "./registry.js";
import { memory } from "../state/memory.js";
import { prices } from "../state/prices.js";
import { clampWakeAt, secondsUntil } from "../utils/time.js";
import { systemOf } from "../utils/symbols.js";
import { distance, fuelCost } from "../utils/nav.js";

registerTool({
  name: "end_loop",
  description: "Finish this wake. Always include summary: 1–2 plain sentences for the human operator — what you did this wake and what you are waiting on. Optionally pass wakeAt (ISO timestamp) to schedule the next wake (ship arrivals and cooldowns are auto-scheduled from tool results regardless; without wakeAt a periodic fallback wake covers you). Other calls in the same batch still run. Call it as soon as there is nothing more worth doing this wake.",
  kind: "internal",
  input: z.object({
    summary: z.string().max(600).optional(),
    wakeAt: z.string().optional(),
    reason: z.string().optional(),
  }),
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

// Longest a wake may block on one ship; anything longer should end the wake
// and let the scheduled arrival/cooldown wake pick it up.
const MAX_WAIT_S = 120;

registerTool({
  name: "wait_for_ship",
  description: `Sleep until a ship arrives and its cooldown ends, when that is at most ${MAX_WAIT_S}s away, then return so you can act on it next round. Longer waits return immediately with the ready time: work other ships or end_loop (the harness auto-wakes on arrival/cooldown). Call it on its own; other calls in the same batch run right away, not after it.`,
  kind: "internal",
  // Deliberately not "shipSymbol": the executor would hold the ship lock for
  // the whole sleep and time out the ship's other queued calls.
  input: z.object({ ship: z.string() }),
  rateCost: 1,
  handler: async ({ ship }, ctx) => {
    const s = await ctx.fresh.ship(ship);
    if (!s) return { summary: `unknown ship ${ship}`, result: { ready: false } };
    const arrival = s.nav.status === "IN_TRANSIT" ? s.nav.route.arrival : undefined;
    const readyInS = Math.max(secondsUntil(arrival), secondsUntil(s.cooldown.expiration), s.cooldown.remainingSeconds);
    const readyAt = new Date(Date.now() + readyInS * 1000).toISOString();
    if (readyInS === 0) return { summary: `${ship} is ready now`, result: { ready: true, waitedSeconds: 0 } };
    if (readyInS > MAX_WAIT_S) {
      return {
        summary: `${ship} ready in ${readyInS}s (${readyAt}), too long to wait in this wake; work other ships or end_loop, the harness auto-wakes it`,
        result: { ready: false, readyInSeconds: readyInS, readyAt },
      };
    }
    // +1s so the server has flipped nav status / cleared the cooldown.
    await new Promise<void>(r => setTimeout(r, (readyInS + 1) * 1000));
    return { summary: `waited ${readyInS + 1}s; ${ship} should now be ready`, result: { ready: true, waitedSeconds: readyInS + 1 } };
  },
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
    const dist = distance(from, to);
    const cruise = fuelCost(dist, "CRUISE"), burn = fuelCost(dist, "BURN"), drift = fuelCost(dist, "DRIFT");
    return {
      summary: `${from.symbol} → ${to.symbol}: distance ${Math.round(dist)}, fuel ~${cruise} (CRUISE) / ~${burn} (BURN) / ${drift} (DRIFT); ship fuel ${ship.fuel.current}/${ship.fuel.capacity}`,
      result: { distance: Math.round(dist), fuelCruise: cruise, fuelBurn: burn, fuelDrift: drift, currentFuel: ship.fuel.current },
    };
  },
});
