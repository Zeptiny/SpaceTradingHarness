import { api } from "../client/index.js";
import { config } from "../config.js";
import { atlas } from "../state/atlas.js";
import { earnings } from "../state/earnings.js";
import { prices } from "../state/prices.js";
import { observeAgent, upsertShip } from "../state/store.js";
import { systemOf } from "../utils/symbols.js";
import { ensureDocked } from "./navstate.js";
import type { FreshReader } from "../guards/index.js";
import type { Ship } from "../generated/types.js";

// Fuel prices older than this don't count toward "cheapest seen".
const FUEL_PRICE_MAX_AGE_MS = 24 * 3600_000;

/** Cheapest FUEL price seen at a market in `system` that sells it. */
export function cheapestFuelPrice(system: string, now = Date.now()): number | null {
  const seen = prices.latest().filter(p =>
    p.good === "FUEL" && p.type !== "IMPORT" && p.purchasePrice != null &&
    systemOf(p.waypoint) === system && now - p.ts <= FUEL_PRICE_MAX_AGE_MS,
  );
  return seen.length ? Math.min(...seen.map(p => p.purchasePrice!)) : null;
}

/**
 * Pure: should a ship top up here? Always when it lacks fuel for the leg it
 * is about to fly; otherwise only when the tank isn't full and this market
 * isn't more than `maxPremium` above the cheapest fuel seen in the system.
 */
export function shouldTopUp(opts: {
  current: number;
  capacity: number;
  need: number;
  price: number;
  cheapest: number | null;
  maxPremium: number;
}): { refuel: boolean; why: string } {
  if (opts.capacity <= 0) return { refuel: false, why: "no fuel tank" };
  if (opts.current >= opts.capacity) return { refuel: false, why: "tank full" };
  if (opts.current < opts.need) return { refuel: true, why: "needed for this leg" };
  if (opts.cheapest !== null && opts.price > opts.cheapest * (1 + opts.maxPremium)) {
    return { refuel: false, why: `fuel ${opts.price} here vs ${opts.cheapest} cheapest seen` };
  }
  return { refuel: true, why: "top-up" };
}

/** True when the ship's current waypoint is known to sell fuel (checks the live market if the atlas doesn't know). */
export async function fuelSoldHere(ship: Ship, fresh: FreshReader): Promise<{ price: number } | null> {
  const here = ship.nav.waypointSymbol;
  const known = atlas.market(here);
  if (known && !atlas.sellsFuel(here)) return null;
  if (!known && !atlas.get(here)?.traits.includes("MARKETPLACE")) return null;
  const market = await fresh.market(systemOf(here), here);
  const fuel = market?.tradeGoods?.find(g => g.symbol === "FUEL");
  if (!fuel || fuel.type === "IMPORT") return null;
  return { price: fuel.purchasePrice };
}

/**
 * Auto top-up before a departure (see AGENT_AUTO_REFUEL). Returns a short
 * note for the tool summary, or null when nothing was bought.
 */
export async function topUpBeforeDeparture(
  symbol: string,
  ship: Ship,
  fresh: FreshReader,
  need: number,
  allowed: boolean,
): Promise<string | null> {
  if (!allowed || !config.agent.autoRefuel) return null;
  if (ship.fuel.capacity <= 0 || ship.fuel.current >= ship.fuel.capacity) return null;
  const sold = await fuelSoldHere(ship, fresh);
  if (!sold) return null;
  const decision = shouldTopUp({
    current: ship.fuel.current,
    capacity: ship.fuel.capacity,
    need,
    price: sold.price,
    cheapest: cheapestFuelPrice(ship.nav.systemSymbol),
    maxPremium: config.agent.autoRefuelMaxPremium,
  });
  if (!decision.refuel) return null;
  await ensureDocked(symbol, ship);
  const { data } = await api.refuel(symbol);
  observeAgent(data.agent);
  ship.fuel = data.fuel;
  upsertShip(ship);
  earnings.record(symbol, -data.transaction.totalPrice, "fuel");
  return `refueled +${data.transaction.units} for ${data.transaction.totalPrice} cr`;
}
