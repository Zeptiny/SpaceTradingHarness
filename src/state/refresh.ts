import { transport } from "../transport/http.js";
import { mirror, storeKeys, type FleetState } from "./store.js";
import { prices } from "./prices.js";
import type { Agent, Contract, Market, Ship } from "../generated/types.js";

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
    mirror.set(storeKeys.agent, data);
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
