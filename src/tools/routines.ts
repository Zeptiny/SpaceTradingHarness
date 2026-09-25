import { z } from "zod";
import { registerTool } from "./registry.js";
import { knownShip, notInTransit } from "../guards/index.js";
import { routines, describeSpec, type RoutineSpec } from "../state/routines.js";
import { atlas } from "../state/atlas.js";
import { config } from "../config.js";
import { cancel, launch, liveMap, toShipView } from "../routines/engine.js";
import { planJumps, planRoute } from "../utils/route.js";
import { systemOf } from "../utils/symbols.js";
import type { Ship } from "../generated/types.js";

registerTool({
  name: "assign_routine",
  description: [
    "Hand a ship a repeating job the harness runs by itself until it stops paying; you are woken only when it stops (with the reason) — not per step. Replaces the ship's current routine. While it runs, your other actions on that ship are refused (cancel_routine first).",
    "kind trade: buy good at buyAt, fly to sellAt (fuel stops planned), sell, repeat. Stops when youGet at sellAt − youPay at buyAt drops below minMarginPerUnit (default 5% of the buy price, min 20) — so it also stops when your own trading saturates the route. Needs a known price at sellAt.",
    "kind mine: fly to asteroid, extract until the hold is full (waiting out cooldowns), jettison anything not in keep (omit keep to keep everything), deliver goods an accepted contract needs if deliverContract, sell the rest at sellAt, repeat.",
    "kind scout: visit markets (waypoints, default every market in the ship's system) never priced or priced longest ago, so prices stay current. Good for probes.",
  ].join(" "),
  kind: "action",
  input: z.object({
    shipSymbol: z.string(),
    kind: z.enum(["trade", "mine", "scout"]),
    good: z.string().optional(),
    buyAt: z.string().optional(),
    sellAt: z.string().optional(),
    minMarginPerUnit: z.number().int().min(0).optional(),
    asteroid: z.string().optional(),
    keep: z.array(z.string()).optional(),
    deliverContract: z.boolean().optional(),
    waypoints: z.array(z.string()).optional(),
  }),
  guards: [knownShip],
  rateCost: 1,
  handler: async (args, ctx) => {
    const ship = await ctx.fresh.ship(args.shipSymbol);
    let spec: RoutineSpec;
    switch (args.kind) {
      case "trade": {
        if (!args.good || !args.buyAt || !args.sellAt) throw new Error("trade needs good, buyAt and sellAt");
        if (args.buyAt === args.sellAt) throw new Error("buyAt and sellAt must differ");
        spec = { kind: "trade", good: args.good, buyAt: args.buyAt, sellAt: args.sellAt, minMarginPerUnit: args.minMarginPerUnit };
        break;
      }
      case "mine": {
        if (!args.asteroid) throw new Error("mine needs asteroid");
        if (ship && !ship.mounts.some(m => m.symbol.startsWith("MOUNT_MINING_LASER"))) throw new Error(`${args.shipSymbol} has no mining laser`);
        spec = { kind: "mine", asteroid: args.asteroid, sellAt: args.sellAt, keep: args.keep, deliverContract: args.deliverContract };
        break;
      }
      case "scout":
        spec = { kind: "scout", waypoints: args.waypoints };
        break;
      default:
        throw new Error(`unknown routine kind ${String(args.kind)}`);
    }
    const prev = routines.active(args.shipSymbol);
    routines.start(args.shipSymbol, spec);
    launch(args.shipSymbol);
    return {
      summary: `${args.shipSymbol} now runs: ${describeSpec(spec)}${prev ? ` (replaced ${describeSpec(prev.spec)})` : ""}`,
      result: { routine: describeSpec(spec) },
    };
  },
});

registerTool({
  name: "cancel_routine",
  description: "Stop a ship's routine so you can command it directly. The ship finishes its current step (a flight in progress continues).",
  kind: "internal",
  input: z.object({ shipSymbol: z.string() }),
  rateCost: 0,
  handler: async ({ shipSymbol }) => {
    const rec = cancel(shipSymbol);
    return rec
      ? { summary: `${shipSymbol} routine cancelled (${describeSpec(rec.spec)}; ${rec.trips} trips, trade profit ${rec.profit})`, result: { cancelled: true } }
      : { summary: `${shipSymbol} has no running routine`, result: { cancelled: false } };
  },
});

/** Human-readable plan for a goto, for the tool summary. */
function describeRoute(ship: Ship, dest: string): string {
  const view = toShipView(ship);
  const destSystem = systemOf(dest);
  if (destSystem !== view.system) {
    const path = planJumps(view.system, destSystem, atlas.allGates());
    return path ? `via gates ${path.join(" → ")}` : `no known gate route to ${destSystem} yet`;
  }
  const from = liveMap.point(view.waypoint);
  const to = liveMap.point(dest);
  if (!from || !to) return "route planned on the way (coordinates not mapped yet)";
  const legs = planRoute({ from, to, stations: liveMap.stations(view.system), fuel: view.fuel.current, capacity: view.fuel.capacity, refuelAtStart: config.agent.autoRefuel });
  if (!legs) return "no route within fuel range";
  return legs.map(l => `${l.to}${l.mode === "DRIFT" ? " (DRIFT)" : ""}`).join(" → ");
}

registerTool({
  name: "goto",
  description: "Send a ship to any waypoint, in this system or another one reachable through known jump gates. The harness plans the legs (topping up at fuel markets on the way, using DRIFT only if nothing else reaches), jumps gates, and wakes you once when the ship arrives. Use it instead of chaining navigate/refuel/jump yourself.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), waypointSymbol: z.string() }),
  guards: [knownShip, notInTransit],
  rateCost: 1,
  handler: async ({ shipSymbol, waypointSymbol }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship?.nav.waypointSymbol === waypointSymbol) {
      return { summary: `${shipSymbol} is already at ${waypointSymbol}`, result: { arrived: true } };
    }
    const plan = ship ? describeRoute(ship, waypointSymbol) : "";
    routines.start(shipSymbol, { kind: "goto", destination: waypointSymbol });
    launch(shipSymbol);
    return {
      summary: `${shipSymbol} heading to ${waypointSymbol}${plan ? `: ${plan}` : ""}; you'll be woken on arrival`,
      result: { route: plan },
    };
  },
});
