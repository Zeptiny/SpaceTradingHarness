import { z } from "zod";
import { api } from "../client/index.js";
import { mirror, mergeSystemWaypoints, storeKeys, upsertShip } from "../state/store.js";
import { refreshAgent, refreshContracts, refreshFleet, fetchMarket, paginate } from "../state/refresh.js";
import { registerTool } from "./registry.js";
import { systemOf } from "../utils/symbols.js";
import { shipyards } from "../state/shipyards.js";
import { atlas, usefulTraits } from "../state/atlas.js";
import type { System, Waypoint, Faction } from "../generated/types.js";
import { WaypointTraitSymbolValues } from "../generated/types.js";
import {
  compactFaction, compactMarket, compactShip, compactShipyard, compactWaypoint, contractSummary,
} from "../state/projections.js";

registerTool({
  name: "get_status",
  description: "Server status: announcements, reset date, leaderboards. Cheap sanity check.",
  kind: "read",
  input: z.object({}).strict(),
  rateCost: 1,
  handler: async () => {
    const r = await api.status();
    return { summary: `server ${String(r.data["status"])}, version ${String(r.data["version"])}`, result: r.data };
  },
});

registerTool({
  name: "get_my_agent",
  description: "Your agent: credits, headquarters, ship count, faction.",
  kind: "read",
  input: z.object({}).strict(),
  rateCost: 1,
  handler: async () => {
    const agent = await refreshAgent();
    if (!agent) throw new Error("agent fetch failed");
    return { summary: `${agent.symbol}: ${agent.credits} cr @ ${agent.headquarters}`, result: agent };
  },
});

registerTool({
  name: "get_agent_events",
  description: "Recent events for your agent (credits earned/spent, merges, etc).",
  kind: "read",
  input: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  rateCost: 1,
  handler: async ({ limit }) => {
    const { data } = await api.agentEvents(limit);
    return { summary: `${data.length} events`, result: data };
  },
});

registerTool({
  name: "list_ships",
  description: "Full fleet state in one call: nav, cargo, fuel, cooldown, modules per ship. Always fresh from the API.",
  kind: "read",
  input: z.object({}).strict(),
  rateCost: 1,
  handler: async () => {
    const ships = await refreshFleet();
    if (!ships) throw new Error("fleet fetch failed");
    return {
      summary: ships.map(s => `${s.symbol}[${s.nav.status}]`).join(" ") || "no ships",
      result: ships.map(compactShip),
    };
  },
});

registerTool({
  name: "get_ship",
  description: "Single ship detail (nav, cargo, fuel, cooldown). Use list_ships for the whole fleet.",
  kind: "read",
  input: z.object({ shipSymbol: z.string() }),
  rateCost: 1,
  handler: async ({ shipSymbol }) => {
    const { data: ship } = await api.getShip(shipSymbol);
    upsertShip(ship);
    return {
      summary: `${ship.symbol} ${ship.nav.status} @ ${ship.nav.waypointSymbol}, fuel ${ship.fuel.current}/${ship.fuel.capacity}, cargo ${ship.cargo.units}/${ship.cargo.capacity}`,
      result: compactShip(ship),
    };
  },
});

registerTool({
  name: "get_contracts",
  description: "Your contracts with deliverables progress, payment and deadlines. Always fresh from the API. Fulfilled/expired contracts are omitted unless includeClosed is true.",
  kind: "read",
  input: z.object({ includeClosed: z.boolean().default(false) }),
  rateCost: 1,
  handler: async ({ includeClosed }) => {
    const contracts = await refreshContracts();
    if (!contracts) throw new Error("contracts fetch failed");
    const items = contracts.map(contractSummary).filter(c => includeClosed || (!c.fulfilled && !c.expired));
    return {
      summary: items.map(c => `${c.id.slice(0, 8)}[${c.fulfilled ? "fulfilled" : c.expired ? "expired" : c.accepted ? "accepted" : "offered"}]`).join(" ") || "no open contracts",
      result: items,
    };
  },
});

registerTool({
  name: "get_systems",
  description: "List systems page by page (static per reset).",
  kind: "read",
  input: z.object({ page: z.number().int().min(1).default(1) }),
  rateCost: 1,
  handler: async ({ page }) => {
    const systems = await api.listSystems(20, page).then(r => r.data);
    for (const s of systems) mirror.set(storeKeys.system(s.symbol), s);
    return { summary: `page ${page}: ${systems.length} systems`, result: systems.map(s => ({ symbol: s.symbol, type: s.type, x: s.x, y: s.y })) };
  },
});

// A large system has 60+ waypoints; one call reads them all so the agent
// never mistakes page 1 for the whole system.
const MAX_WAYPOINT_PAGES = 10;

registerTool({
  name: "get_system_waypoints",
  description: "Every waypoint in a system (all pages in one call), optionally only those with a trait (must be a valid WaypointTraitSymbol, e.g. MARKETPLACE, SHIPYARD, COMMON_METAL_DEPOSITS). Traits are trimmed to the useful ones. The summary gives the API's total count.",
  kind: "read",
  input: z.object({
    systemSymbol: z.string(),
    traitFilter: z.enum(WaypointTraitSymbolValues).optional(),
  }),
  rateCost: 3,
  handler: async ({ systemSymbol, traitFilter }) => {
    const waypoints: Waypoint[] = [];
    let total: number | undefined;
    for (let page = 1; page <= MAX_WAYPOINT_PAGES; page++) {
      const r = await api.listSystemWaypoints(systemSymbol, 20, page, traitFilter);
      waypoints.push(...r.data);
      total = (r.meta as { total?: number } | undefined)?.total ?? total;
      if (r.data.length < 20 || (total !== undefined && waypoints.length >= total)) break;
    }
    mergeSystemWaypoints(systemSymbol, waypoints);
    atlas.record(waypoints);
    const missing = total !== undefined && waypoints.length < total ? ` (${total - waypoints.length} more not read)` : "";
    return {
      summary: `${systemSymbol}: ${waypoints.length} of ${total ?? waypoints.length} waypoints${traitFilter ? ` with ${traitFilter}` : ""}${missing}`,
      result: waypoints.map(w => ({ symbol: w.symbol, type: w.type, x: w.x, y: w.y, traits: usefulTraits(w.traits.map(t => t.symbol)) })),
    };
  },
});

registerTool({
  name: "get_waypoint",
  description: "Single waypoint detail incl. traits and orbitals. Always fresh from the API.",
  kind: "read",
  input: z.object({ waypointSymbol: z.string() }),
  rateCost: 1,
  handler: async ({ waypointSymbol }) => {
    const system = systemOf(waypointSymbol);
    const { data: wp } = await api.getWaypoint(system, waypointSymbol);
    mirror.set(storeKeys.waypoint(system, waypointSymbol), wp);
    mergeSystemWaypoints(system, [wp]);
    atlas.record([wp]);
    return { summary: `${wp.symbol} ${wp.type} [${wp.traits.map(t => t.symbol).join(",")}]`, result: compactWaypoint(wp) };
  },
});

registerTool({
  name: "get_market",
  description: "Market at a waypoint: trade goods with buy/sell prices, volumes and EXPORT/IMPORT side. Always fresh; prices recorded to history.",
  kind: "read",
  input: z.object({ waypointSymbol: z.string() }),
  rateCost: 1,
  handler: async ({ waypointSymbol }) => {
    const system = systemOf(waypointSymbol);
    const market = await fetchMarket(system, waypointSymbol);
    const goods = market.tradeGoods ?? [];
    return {
      summary: goods.length
        ? `${waypointSymbol}: ${goods.length} goods with live prices`
        : `${waypointSymbol}: goods listed, prices hidden (no ship present)`,
      result: compactMarket(market),
    };
  },
});

registerTool({
  name: "get_shipyard",
  description: "Shipyard at a waypoint: ship types sold, and prices/specs when one of your ships is present there. Prices seen are remembered (working memory economy.knownShipOffers). Always fresh from the API.",
  kind: "read",
  input: z.object({ waypointSymbol: z.string() }),
  rateCost: 1,
  handler: async ({ waypointSymbol }) => {
    const system = systemOf(waypointSymbol);
    const { data } = await api.getShipyard(system, waypointSymbol);
    mirror.set(storeKeys.shipyard(system, waypointSymbol), data);
    shipyards.record(data);
    const priced = (data.ships ?? []).map(s => `${s.type}=${s.purchasePrice}`);
    return {
      summary: `${waypointSymbol} sells: ${priced.length ? priced.join(", ") : `${(data.shipTypes ?? []).map(t => t.type).join(", ")} (prices hidden — no ship of yours here)`}`,
      result: compactShipyard(data),
    };
  },
});

registerTool({
  name: "get_jump_gate",
  description: "Jump gate at a waypoint: connected systems.",
  kind: "read",
  input: z.object({ waypointSymbol: z.string() }),
  rateCost: 1,
  handler: async ({ waypointSymbol }) => {
    const system = systemOf(waypointSymbol);
    const { data } = await api.getJumpGate(system, waypointSymbol);
    atlas.recordGate(data, system);
    return { summary: `${waypointSymbol} gate → ${(data.connections ?? []).join(", ") || "none"}`, result: data };
  },
});

registerTool({
  name: "get_construction",
  description: "Construction site at a waypoint: required materials and progress.",
  kind: "read",
  input: z.object({ waypointSymbol: z.string() }),
  rateCost: 1,
  handler: async ({ waypointSymbol }) => {
    const system = systemOf(waypointSymbol);
    const { data } = await api.getConstruction(system, waypointSymbol);
    atlas.recordConstruction(data);
    return { summary: `${waypointSymbol} construction${data.isComplete ? " (complete)" : ""}: ${(data.materials ?? []).map(m => `${m.tradeSymbol}:${m.fulfilled}/${m.required}`).join(" ")}`, result: data };
  },
});

registerTool({
  name: "get_supply_chain",
  description: "Trade relationships between goods: which imports a market needs to produce each export. Pass tradeSymbol to get just the inputs of that good and the goods it feeds into (the full map is large).",
  kind: "read",
  input: z.object({ tradeSymbol: z.string().optional() }),
  rateCost: 1,
  handler: async ({ tradeSymbol }) => {
    const r = await api.supplyChain();
    const map = ((r.data as { exportToImportMap?: Record<string, string[]> }).exportToImportMap ?? {});
    if (!tradeSymbol) return { summary: `supply chain: ${Object.keys(map).length} exports`, result: map };
    const inputs = map[tradeSymbol] ?? [];
    const feeds = Object.entries(map).filter(([, ins]) => ins.includes(tradeSymbol)).map(([out]) => out);
    return {
      summary: `${tradeSymbol}: made from [${inputs.join(", ") || "nothing"}], feeds [${feeds.join(", ") || "nothing"}]`,
      result: { tradeSymbol, madeFrom: inputs, feedsInto: feeds },
    };
  },
});

registerTool({
  name: "get_factions",
  description: "List factions with traits (static per reset).",
  kind: "read",
  input: z.object({}).strict(),
  rateCost: 1,
  handler: async () => {
    const factions = await paginate<Faction>("getFactions", {}, 3);
    mirror.set("factions", factions);
    return { summary: factions.map(f => f.symbol).join(", "), result: factions.map(compactFaction) };
  },
});
