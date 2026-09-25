import { transport } from "../transport/http.js";
import { mirror, observeAgent, storeKeys, type FleetState } from "./store.js";
import { prices } from "./prices.js";
import { atlas } from "./atlas.js";
import { shipyards } from "./shipyards.js";
import type { Agent, Contract, Market, Ship, Shipyard, Waypoint } from "../generated/types.js";

interface PagedResult<T> {
  data: T[];
  meta?: { total?: number; page?: number; limit?: number };
}

export async function paginate<T>(
  routeName: Parameters<typeof transport.request>[0],
  query: Record<string, string | number | boolean | undefined> = {},
  maxPages = 5,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const r = await transport.request<T[]>(routeName, { query: { ...query, limit: 20, page } });
    const meta = (r as PagedResult<T>).meta;
    const items = r.data;
    out.push(...items);
    const total = meta?.total ?? out.length;
    if (out.length >= total || page >= maxPages) break;
    page++;
  }
  return out;
}

// Every refresh hits the API. Stale data is never served to the agent; the
// mirror write at the end is only for the panel. On failure these return
// undefined so callers can surface "unavailable" instead of old state.

export async function refreshAgent(): Promise<Agent | undefined> {
  try {
    const { data } = await transport.request<Agent>("getMyAgent");
    observeAgent(data);
    return data;
  } catch (err) {
    console.error("[refresh] agent failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function refreshFleet(): Promise<Ship[] | undefined> {
  try {
    const ships = await paginate<Ship>("getMyShips", {}, 3);
    mirror.set(storeKeys.fleet, { ships } satisfies FleetState);
    return ships;
  } catch (err) {
    console.error("[refresh] fleet failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function refreshContracts(): Promise<Contract[] | undefined> {
  try {
    const contracts = await paginate<Contract>("getContracts", {}, 5);
    mirror.set(storeKeys.contracts, contracts);
    return contracts;
  } catch (err) {
    console.error("[refresh] contracts failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function fetchMarket(systemSymbol: string, waypointSymbol: string): Promise<Market> {
  const { data } = await transport.request<Market>("getMarket", {
    path: { systemSymbol, waypointSymbol },
  });
  mirror.set(storeKeys.market(systemSymbol, waypointSymbol), data);
  prices.record(data);
  return data;
}

export async function fetchWaypoint(systemSymbol: string, waypointSymbol: string): Promise<Waypoint> {
  const { data } = await transport.request<Waypoint>("getWaypoint", { path: { systemSymbol, waypointSymbol } });
  mirror.set(storeKeys.waypoint(systemSymbol, waypointSymbol), data);
  atlas.record([data]);
  return data;
}

export async function fetchShipyard(systemSymbol: string, waypointSymbol: string): Promise<Shipyard> {
  const { data } = await transport.request<Shipyard>("getShipyard", { path: { systemSymbol, waypointSymbol } });
  mirror.set(storeKeys.shipyard(systemSymbol, waypointSymbol), data);
  shipyards.record(data);
  return data;
}

/**
 * Wake-start collector: read the market and shipyard at every waypoint where
 * one of our ships sits. Prices are only visible with a ship present, so this
 * turns every parked ship into a free price probe and keeps trade leads and
 * ship offers current without the agent spending turns on it. Unknown
 * waypoints are looked up once (traits are static per reset). Failures are
 * skipped silently — this is best-effort enrichment.
 */
export async function scanShipLocations(ships: Ship[], maxRequests: number): Promise<{ markets: string[]; shipyards: string[] }> {
  const out = { markets: [] as string[], shipyards: [] as string[] };
  const locations = [...new Set(ships.filter(s => s.nav.status !== "IN_TRANSIT").map(s => s.nav.waypointSymbol))];
  let budget = maxRequests;
  for (const wp of locations) {
    if (budget <= 0) break;
    const system = ships.find(s => s.nav.waypointSymbol === wp)!.nav.systemSymbol;
    try {
      let known = atlas.get(wp);
      if (!known) {
        budget--;
        await fetchWaypoint(system, wp);
        known = atlas.get(wp);
      }
      if (budget > 0 && known?.traits.includes("MARKETPLACE")) {
        budget--;
        await fetchMarket(system, wp);
        out.markets.push(wp);
      }
      if (budget > 0 && known?.traits.includes("SHIPYARD")) {
        budget--;
        await fetchShipyard(system, wp);
        out.shipyards.push(wp);
      }
    } catch (err) {
      console.error(`[refresh] scan of ${wp} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}
