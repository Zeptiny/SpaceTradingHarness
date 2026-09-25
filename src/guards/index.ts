import type { Agent, Market, Ship, ShipNavFlightMode, ShipNavStatus, Shipyard, Waypoint } from "../generated/types.js";
import { systemOf } from "../utils/symbols.js";
import { distance, fuelCost } from "../utils/nav.js";
import { secondsUntil, WAIT_HINT } from "../utils/time.js";

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
  shipyard(systemSymbol: string, waypointSymbol: string): Promise<Shipyard | undefined>;
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

// Factory-built guards are anonymous arrows; give them a readable name for
// the activity log ("guard inOrbit: …" instead of "guard : …").
function named(name: string, guard: Guard): Guard {
  return Object.defineProperty(guard, "name", { value: name });
}

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

const navStatus = (guardName: string, expected: ShipNavStatus): Guard => named(guardName, async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (r.ship.nav.status !== expected) {
    return { ok: false, reason: `${r.symbol} nav status is ${r.ship.nav.status}, need ${expected}` };
  }
  return { ok: true };
});

export const isDocked = navStatus("isDocked", "DOCKED");
export const inOrbit = navStatus("inOrbit", "IN_ORBIT");

export const notInTransit: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (r.ship.nav.status === "IN_TRANSIT") {
    // Status comes from a live fetch; the arrival time is the server's, so
    // "0s" with IN_TRANSIT only means the server hasn't flipped it yet.
    const route = r.ship.nav.route;
    const arrival = route?.arrival ? new Date(route.arrival).toISOString() : "unknown";
    const left = secondsUntil(route?.arrival);
    return {
      ok: false,
      reason: `${r.symbol} in transit to ${route?.destination.symbol ?? "?"}, arrives ${arrival} (${left > 0 ? `${left}s from now` : "any second"}); ${WAIT_HINT}`,
    };
  }
  return { ok: true };
};

export const cooldownClear: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  // remainingSeconds is computed by the server at fetch time, so no local
  // clock is involved. Survey, extract, siphon, refine, scan and jump all
  // share this one reactor cooldown.
  const cd = r.ship.cooldown;
  if (cd && cd.remainingSeconds > 0) {
    const until = cd.expiration ? ` (until ${cd.expiration})` : "";
    return {
      ok: false,
      reason: `${r.symbol} on cooldown ${cd.remainingSeconds}s more${until}, shared by survey/extract/siphon/refine/scan/jump; ${WAIT_HINT}`,
    };
  }
  return { ok: true };
};

export const shipHasMount = (mountPrefix: string): Guard => named(`shipHasMount(${mountPrefix})`, async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (!r.ship.mounts.some(m => m.symbol.startsWith(mountPrefix))) {
    return { ok: false, reason: `${r.symbol} has no ${mountPrefix} mount` };
  }
  return { ok: true };
});

export const shipHasModule = (...modulePrefixes: string[]): Guard => named(`shipHasModule(${modulePrefixes.join("|")})`, async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  if (!r.ship.modules.some(m => modulePrefixes.some(p => m.symbol.startsWith(p)))) {
    return { ok: false, reason: `${r.symbol} has no ${modulePrefixes.join(" / ")} module` };
  }
  return { ok: true };
});

export const cargoHasRoom = (unitsArg = "units"): Guard => named("cargoHasRoom", async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const units = Number(ctx.args[unitsArg] ?? 0);
  const free = r.ship.cargo.capacity - r.ship.cargo.units;
  if (units > free) return { ok: false, reason: `only ${free} cargo space free, need ${units}` };
  return { ok: true };
});

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

// transfer_cargo: the receiving ship must be a different ship at the same
// waypoint, not in transit, with room for the units. Matching nav state
// (both docked or both in orbit) is handled by the tool, not rejected here.
export const transferTargetReady: Guard = async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const target = ctx.args["receiveShipSymbol"];
  if (typeof target !== "string") return { ok: false, reason: "missing receiveShipSymbol arg" };
  if (target === r.symbol) return { ok: false, reason: "cannot transfer cargo to the same ship" };
  const recv = await ctx.fresh.ship(target);
  if (!recv) return { ok: false, reason: `unknown receiving ship ${target}` };
  for (const [sym, s] of [[r.symbol, r.ship], [target, recv]] as const) {
    if (s.nav.status === "IN_TRANSIT") {
      const arrival = s.nav.route?.arrival ? new Date(s.nav.route.arrival).toISOString() : "unknown";
      return { ok: false, reason: `${sym} in transit until ${arrival}` };
    }
  }
  if (recv.nav.waypointSymbol !== r.ship.nav.waypointSymbol) {
    return { ok: false, reason: `${target} is at ${recv.nav.waypointSymbol}, ${r.symbol} is at ${r.ship.nav.waypointSymbol}; both must be at the same waypoint` };
  }
  const units = Number(ctx.args["units"] ?? 0);
  const free = recv.cargo.capacity - recv.cargo.units;
  if (units > free) return { ok: false, reason: `${target} has only ${free} cargo space free, need ${units}` };
  return { ok: true };
};

export const waypointHasTrait = (trait: string): Guard => named(`waypointHasTrait(${trait})`, async (_name, ctx) => {
  const r = await requireShip(ctx);
  if ("error" in r) return r.error;
  const wSym = r.ship.nav.waypointSymbol;
  const wp = await ctx.fresh.waypoint(systemOf(wSym), wSym);
  if (!wp) return { ok: false, reason: `waypoint ${wSym} not found` };
  if (!wp.traits.some(t => t.symbol === trait)) {
    return { ok: false, reason: `${wSym} lacks ${trait}` };
  }
  return { ok: true };
});

// Market side check using the API's own semantics:
// EXPORT = market sells (agent can buy), IMPORT = market buys (agent can sell),
// EXCHANGE = both. Also verifies the market IS the ship's current waypoint.
export const marketTrades = (mode: "sell" | "buy"): Guard => named(mode === "buy" ? "marketSells" : "marketBuys", async (_name, ctx) => {
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
});

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
  const modeArg = ctx.args["flightMode"];
  const mode = (typeof modeArg === "string" ? modeArg : ship.nav.flightMode) as ShipNavFlightMode;
  const need = fuelCost(distance(from, to), mode);
  if (ship.fuel.capacity > 0 && ship.fuel.current < need) {
    const hint = mode === "DRIFT" ? "" : " — refuel first, or use flightMode DRIFT (1 fuel, slow)";
    return { ok: false, reason: `fuel ${ship.fuel.current}/${ship.fuel.capacity} < ${need} needed (${mode})${hint}` };
  }
  return { ok: true };
};

export const hasCredits = (min: number): Guard => named("hasCredits", async (_name, ctx) => {
  let agent: Agent | undefined;
  try {
    agent = await ctx.fresh.agent();
  } catch {
    agent = undefined;
  }
  if (!agent) return { ok: true, reason: "credit balance unknown (allowed)" };
  if (agent.credits < min) return { ok: false, reason: `credits ${agent.credits} < required ${min}` };
  return { ok: true };
});

// Ship purchase check: the shipyard only lists prices while one of our ships
// is there (which the API also requires to buy), and the purchase must leave
// at least `reserve` credits for fuel and cargo capital.
export const canBuyShip = (reserve: number): Guard => named("canBuyShip", async (_name, ctx) => {
  const type = ctx.args["shipType"];
  const wSym = ctx.args["waypointSymbol"];
  if (typeof type !== "string" || typeof wSym !== "string") return { ok: false, reason: "missing shipType/waypointSymbol arg" };
  const yard = await ctx.fresh.shipyard(systemOf(wSym), wSym);
  if (!yard) return { ok: false, reason: `no shipyard at ${wSym}` };
  if (!yard.shipTypes.some(t => t.type === type)) {
    return { ok: false, reason: `${wSym} does not sell ${type} (sells ${yard.shipTypes.map(t => t.type).join(", ")})` };
  }
  const offer = yard.ships?.find(s => s.type === type);
  if (!offer) return { ok: false, reason: `none of your ships is at ${wSym} — navigate one there first (required to buy and to see prices)` };
  let agent: Agent | undefined;
  try {
    agent = await ctx.fresh.agent();
  } catch {
    agent = undefined;
  }
  if (!agent) return { ok: false, reason: "credit balance unavailable — retry" };
  if (agent.credits - offer.purchasePrice < reserve) {
    return {
      ok: false,
      reason: `${type} costs ${offer.purchasePrice}; credits ${agent.credits} would drop below the ${reserve} reserve (need ${offer.purchasePrice + reserve})`,
    };
  }
  return { ok: true };
});
