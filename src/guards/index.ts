import type { Agent, Market, Ship, ShipNavStatus, Waypoint } from "../generated/types.js";
import { systemOf } from "../utils/symbols.js";

/**
 * Fresh state reader. Implementations fetch live from the API (memoized per
 * tool call so a guard chain burns one request per resource, not one per
 * guard). A 404 resolves to undefined; other fetch errors propagate and
 * surface as api-error outcomes.
 */
export interface FreshReader {
  ship(symbol: string): Promise<Ship | undefined>;
  market(systemSymbol: string, waypointSymbol: string): Promise<Market | undefined>;
  waypoint(systemSymbol: string, waypointSymbol: string): Promise<Waypoint | undefined>;
  agent(): Promise<Agent | undefined>;
}

export interface GuardContext {
  args: Record<string, unknown>;
  fresh: FreshReader;
}

export interface GuardResult {
  ok: boolean;
  reason?: string | undefined;
}

export type Guard = (name: string, ctx: GuardContext) => Promise<GuardResult>;

function shipSymbolFromArgs(ctx: GuardContext): string | null {
  const s = ctx.args["shipSymbol"];
  return typeof s === "string" ? s : null;
}

async function requireShip(ctx: GuardContext): Promise<{ symbol: string; ship: Ship } | { error: GuardResult }> {
  const symbol = shipSymbolFromArgs(ctx);
  if (!symbol) return { error: { ok: false, reason: "missing shipSymbol arg" } };
  const ship = await ctx.fresh.ship(symbol);
  if (!ship) {
    return { error: { ok: false, reason: `unknown ship ${symbol}` } };
  }
  return { symbol, ship };
}

export const knownShip: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  return "error" in r ? r.error : { ok: true };
};

const navStatus = (expected: ShipNavStatus): Guard => async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (r.ship.nav.status !== expected) {
    return { ok: false, reason: `${r.symbol} nav status is ${r.ship.nav.status}, need ${expected}` };
  }
  return { ok: true };
};

export const isDocked = navStatus("DOCKED");
export const inOrbit = navStatus("IN_ORBIT");

export const notInTransit: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (r.ship.nav.status === "IN_TRANSIT") {
    const arrival = r.ship.nav.route?.arrival ? new Date(r.ship.nav.route.arrival).toISOString() : "unknown";
    return { ok: false, reason: `${r.symbol} in transit until ${arrival}` };
  }
  return { ok: true };
};

export const cooldownClear: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (r.ship.cooldown && r.ship.cooldown.remainingSeconds > 0) {
    return { ok: false, reason: `${r.symbol} cooling down ${r.ship.cooldown.remainingSeconds}s` };
  }
  return { ok: true };
};

export const shipHasMount = (mountPrefix: string): Guard => async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (!r.ship.mounts.some(m => m.symbol.startsWith(mountPrefix))) {
    return { ok: false, reason: `${r.symbol} has no ${mountPrefix} mount` };
  }
  return { ok: true };
};

export const shipHasModule = (modulePrefix: string): Guard => async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (!r.ship.modules.some(m => m.symbol.startsWith(modulePrefix))) {
    return { ok: false, reason: `${r.symbol} has no ${modulePrefix} module` };
  }
  return { ok: true };
};

export const cargoHasRoom = (unitsArg = "units"): Guard => async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const units = Number(ctx.args[unitsArg] ?? 0);
  const free = r.ship.cargo.capacity - r.ship.cargo.units;
  if (units > free) return { ok: false, reason: `only ${free} cargo space free, need ${units}` };
  return { ok: true };
};

export const cargoHasGood: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const symbol = ctx.args["symbol"] ?? ctx.args["tradeSymbol"];
  const units = Number(ctx.args["units"] ?? 0);
  if (typeof symbol !== "string") return { ok: false, reason: "missing symbol/tradeSymbol arg" };
  const inv = r.ship.cargo.inventory.find(i => i.symbol === symbol);
  if (!inv || inv.units < units) {
    return { ok: false, reason: `cargo has ${inv?.units ?? 0}x ${symbol}, need ${units}` };
  }
  return { ok: true };
};

export const waypointHasTrait = (trait: string): Guard => async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const wSym = r.ship.nav.waypointSymbol;
  const wp = await ctx.fresh.waypoint(systemOf(wSym), wSym);
  if (!wp) return { ok: false, reason: `waypoint ${wSym} not found` };
  if (!wp.traits.some(t => t.symbol === trait)) {
    return { ok: false, reason: `${wSym} lacks ${trait}` };
  }
  return { ok: true };
};

// Market side check using the API's own semantics:
// EXPORT = market sells (agent can buy), IMPORT = market buys (agent can sell),
// EXCHANGE = both. Also verifies the market IS the ship's current waypoint.
export const marketTrades = (mode: "sell" | "buy"): Guard => async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const symbol = ctx.args["symbol"];
  if (typeof symbol !== "string") return { ok: false, reason: "missing symbol arg" };
  const wSym = r.ship.nav.waypointSymbol;
  const market = await ctx.fresh.market(systemOf(wSym), wSym);
  if (!market) return { ok: false, reason: `no market at ${wSym}` };
  const entry = market.tradeGoods?.find(t => t.symbol === symbol);
  if (!entry) return { ok: false, reason: `${wSym} market has no ${symbol}` };
  const t = entry.type;
  const canBuyFrom = t === "EXPORT" || t === "EXCHANGE";
  const canSellTo = t === "IMPORT" || t === "EXCHANGE";
  if (mode === "sell" && !canSellTo) return { ok: false, reason: `${wSym} is ${t} for ${symbol} — does not buy it` };
  if (mode === "buy" && !canBuyFrom) return { ok: false, reason: `${wSym} is ${t} for ${symbol} — does not sell it` };
  return { ok: true };
};

export const marketSellsFuel: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const wSym = r.ship.nav.waypointSymbol;
  const market = await ctx.fresh.market(systemOf(wSym), wSym);
  if (!market) return { ok: false, reason: `no market at ${wSym}` };
  const entry = market.tradeGoods?.find(t => t.symbol === "FUEL");
  if (!entry || (entry.type !== "EXPORT" && entry.type !== "EXCHANGE")) {
    return { ok: false, reason: `${wSym} does not sell FUEL` };
  }
  return { ok: true };
};

export const hasFuelForRoute: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const { ship } = r;
  const dest = ctx.args["waypointSymbol"];
  if (typeof dest !== "string") return { ok: false, reason: "missing waypointSymbol arg" };
  if (systemOf(dest) !== ship.nav.systemSymbol) {
    return { ok: true, reason: "cross-system: use warp/jump (fuel checked by those tools)" };
  }
  const from = await ctx.fresh.waypoint(systemOf(ship.nav.waypointSymbol), ship.nav.waypointSymbol);
  const to = await ctx.fresh.waypoint(systemOf(dest), dest);
  if (!from || !to) {
    return { ok: false, reason: "waypoint data unavailable for route check" };
  }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (ship.fuel.capacity > 0 && ship.fuel.current < dist) {
    return { ok: false, reason: `fuel ${ship.fuel.current}/${ship.fuel.capacity} < distance ${Math.round(dist)} — refuel first` };
  }
  return { ok: true };
};

export const hasCredits = (min: number): Guard => async (_name, ctx) => {
  let agent: Agent | undefined;
  try {
    agent = await ctx.fresh.agent();
  } catch {
    agent = undefined;
  }
  if (!agent) return { ok: true, reason: "credit balance unknown (allowed)" };
  if (agent.credits < min) return { ok: false, reason: `credits ${agent.credits} < required ${min}` };
  return { ok: true };
};
