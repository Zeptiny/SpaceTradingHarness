import { config } from "../config.js";
import { atlas } from "./atlas.js";
import { prices } from "./prices.js";
import { shipyards } from "./shipyards.js";
import { runtime } from "./runtime.js";
import { fetchMarket, fetchShipyard, fetchWaypoint } from "./refresh.js";
import { systemOf } from "../utils/symbols.js";

/**
 * Reads the market (and a stale shipyard) at a ship's destination the moment
 * it arrives. Prices are only visible while a ship is present, and the logs
 * showed the agent spending a get_market call after almost every arrival;
 * this does it for it, off the agent's rounds. Reads land in price history,
 * trade leads and the next wake's working memory.
 */
const AFTER_ARRIVAL_MS = 1_500;
// Skip the read when something else priced the market this recently.
const FRESH_MS = 30_000;
const SHIPYARD_FRESH_MS = 30 * 60_000;

const timers = new Map<string, NodeJS.Timeout>();

export function expectArrival(ship: string, waypoint: string, arrival: string | number | undefined): void {
  if (!config.agent.readMarketOnArrival) return;
  const at = typeof arrival === "number" ? arrival : arrival ? Date.parse(arrival) : Date.now();
  const delay = Math.max(0, (Number.isFinite(at) ? at : Date.now()) - Date.now()) + AFTER_ARRIVAL_MS;
  const prev = timers.get(ship);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    timers.delete(ship);
    void readAt(waypoint).catch(err => {
      console.warn(`[arrivals] read at ${waypoint} failed:`, err instanceof Error ? err.message : err);
    });
  }, Math.min(delay, 2 ** 31 - 1));
  timer.unref?.();
  timers.set(ship, timer);
}

export async function readAt(waypoint: string): Promise<{ market: boolean; shipyard: boolean }> {
  const out = { market: false, shipyard: false };
  if (runtime.paused) return out;
  const system = systemOf(waypoint);
  let known = atlas.get(waypoint);
  if (!known) {
    await fetchWaypoint(system, waypoint);
    known = atlas.get(waypoint);
  }
  if (!known) return out;
  const pricedAt = prices.marketsSeen().get(waypoint);
  if (known.traits.includes("MARKETPLACE") && !(pricedAt && Date.now() - pricedAt < FRESH_MS)) {
    await fetchMarket(system, waypoint);
    out.market = true;
  }
  const yardAt = shipyards.seenAt(waypoint);
  if (known.traits.includes("SHIPYARD") && !(yardAt && Date.now() - yardAt < SHIPYARD_FRESH_MS)) {
    await fetchShipyard(system, waypoint);
    out.shipyard = true;
  }
  return out;
}
