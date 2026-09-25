import { z } from "zod";
import { api } from "../client/index.js";
import { mirror, mergeSystemWaypoints, storeKeys, upsertShip } from "../state/store.js";
import { refreshAgent, refreshContracts, refreshFleet, fetchMarket, paginate } from "../state/refresh.js";
import { registerTool } from "./registry.js";
import { systemOf } from "../utils/symbols.js";
import { shipyards } from "../state/shipyards.js";
import { atlas } from "../state/atlas.js";
import type { System, Waypoint, Faction, Shipyard } from "../generated/types.js";
import { WaypointTraitSymbolValues } from "../generated/types.js";
import { compactShip } from "../state/projections.js";

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
  description: "Your contracts with terms, deliverables progress and deadlines. Always fresh from the API.",
  kind: "read",
  input: z.object({}).strict(),
  rateCost: 1,
  handler: async () => {
    const contracts = await refreshContracts();
    if (!contracts) throw new Error("contracts fetch failed");
    return {
      summary: contracts.map(c => `${c.id.slice(0, 8)}[${c.accepted ? "accepted" : "offered"}${c.fulfilled ? ",done" : ""}]`).join(" "),
      result: contracts,
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

registerTool({
  name: "get_system_waypoints",
  description: "Waypoints in a system; optional trait filter (must be a valid WaypointTraitSymbol, e.g. MARKETPLACE, COMMON_METAL_DEPOSITS).",
  kind: "read",
  input: z.object({
    systemSymbol: z.string(),
    traitFilter: z.enum(WaypointTraitSymbolValues).optional(),
    page: z.number().int().min(1).default(1),
  }),
  rateCost: 1,
  handler: async ({ systemSymbol, traitFilter, page }) => {
    const waypoints = await api.listSystemWaypoints(systemSymbol, 20, page, traitFilter).then(r => r.data);
    const merged = mergeSystemWaypoints(systemSymbol, waypoints);
    atlas.record(waypoints);
    return {
      summary: `page ${page}: ${waypoints.length}${traitFilter ? ` (${traitFilter})` : ""}; system total: ${merged.length} waypoints`,
      result: waypoints.map(w => ({ symbol: w.symbol, type: w.type, x: w.x, y: w.y, traits: w.traits.map(t => t.symbol) })),
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
    return { summary: `${wp.symbol} ${wp.type} [${wp.traits.map(t => t.symbol).join(",")}]`, result: wp };
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
      summary: `${waypointSymbol}: ${goods.length} goods (e.g. ${goods.slice(0, 3).map(g => g.symbol).join(", ")})`,
      result: market,
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
    mirror.set(storeKeys.market(system, waypointSymbol) + ":shipyard", data);
    shipyards.record(data);
    const priced = (data.ships ?? []).map(s => `${s.type}=${s.purchasePrice}`);
    return {
      summary: `${waypointSymbol} sells: ${priced.length ? priced.join(", ") : `${(data.shipTypes ?? []).map(t => t.type).join(", ")} (prices hidden — no ship of yours here)`}`,
      result: data,
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
    return { summary: `${waypointSymbol} construction${data.isComplete ? " (complete)" : ""}: ${(data.materials ?? []).map(m => `${m.tradeSymbol}:${m.fulfilled}/${m.required}`).join(" ")}`, result: data };
  },
});

registerTool({
  name: "get_supply_chain",
  description: "Trade relationships between goods: what refines/produces into what.",
  kind: "read",
  input: z.object({}).strict(),
  rateCost: 1,
  handler: async () => {
    const r = await api.supplyChain();
    return { summary: "supply chain data", result: r.data };
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
    return { summary: factions.map(f => f.symbol).join(", "), result: factions };
  },
});
