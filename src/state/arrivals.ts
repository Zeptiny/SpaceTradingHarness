import { config } from "../config.js";
import { atlas } from "./atlas.js";
import { prices } from "./prices.js";
import { shipyards } from "./shipyards.js";
import { runtime } from "./runtime.js";
import { chartWaypoint, fetchMarket, fetchShipyard, fetchWaypoint } from "./refresh.js";
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
    void readAt(waypoint, ship).catch(err => {
      console.warn(`[arrivals] read at ${waypoint} failed:`, err instanceof Error ? err.message : err);
    });
  }, Math.min(delay, 2 ** 31 - 1));
  timer.unref?.();
  timers.set(ship, timer);
}

/**
 * Arms the arrival read for ships already in transit that have none (their
 * timer died with the process that sent them, e.g. across a restart).
 */
export function resumeArrivals(ships: { symbol: string; nav: { status: string; route: { destination: { symbol: string }; arrival: string } } }[]): void {
  for (const s of ships) {
    if (s.nav.status === "IN_TRANSIT" && !timers.has(s.symbol)) expectArrival(s.symbol, s.nav.route.destination.symbol, s.nav.route.arrival);
  }
}

export async function readAt(waypoint: string, ship?: string): Promise<{ market: boolean; shipyard: boolean; charted: number | null }> {
  const out = { market: false, shipyard: false, charted: null as number | null };
  if (runtime.paused) return out;
  const system = systemOf(waypoint);
  let known = atlas.get(waypoint);
  if (!known) {
    await fetchWaypoint(system, waypoint);
    known = atlas.get(waypoint);
  }
  if (!known) return out;
  // An uncharted waypoint hides its traits (a market or shipyard included); charting reveals them and pays a reward.
  if (ship && config.agent.autoChart && config.agent.policy !== "readonly" && known.traits.includes("UNCHARTED")) {
    const { reward } = await chartWaypoint(ship);
    out.charted = reward;
    console.log(`[arrivals] ${ship} charted ${waypoint} (+${reward} cr)`);
    known = atlas.get(waypoint) ?? known;
  }
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
