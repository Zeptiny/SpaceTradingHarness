import { z } from "zod";
import { api } from "../client/index.js";
import { observeAgent, removeShip, upsertContract, upsertShip } from "../state/store.js";
import { compactCargo } from "../state/projections.js";
import { registerTool } from "./registry.js";
import {
  cargoHasGood, cooldownClear, inOrbit, isDocked, knownShip,
  noActiveContract, notInTransit, shipHasModule, shipHasMount, transferTargetReady, waypointHasTrait,
} from "../guards/index.js";
import { cooldownNote, cooldownWakeAt } from "../utils/time.js";
import { ensureDocked, ensureOrbit } from "./navstate.js";
import type { Survey } from "../generated/types.js";
import { earnings } from "../state/earnings.js";
import { expectArrival } from "../state/arrivals.js";

// ---- Cross-system travel ----

registerTool({
  name: "warp",
  description: "Warp ship to a waypoint in ANOTHER system (ship in orbit, needs WARP_DRIVE module + fuel). Harness wakes on arrival.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), waypointSymbol: z.string() }),
  guards: [knownShip, notInTransit, inOrbit, shipHasModule("MODULE_WARP_DRIVE")],
  rateCost: 2,
  handler: async ({ shipSymbol, waypointSymbol }, ctx) => {
    const { data } = await api.warp(shipSymbol, waypointSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, nav: data.nav, fuel: data.fuel });
    return {
      summary: `${shipSymbol} warping to ${waypointSymbol}, fuel ${data.fuel.current}/${data.fuel.capacity}`,
      result: data,
      followUpWakeAt: data.nav.route?.arrival ? Date.parse(data.nav.route.arrival) + 2000 : undefined,
      followUpReason: `${shipSymbol} warp arrival`,
    };
  },
});

registerTool({
  name: "jump",
  description: "Jump ship from the jump gate it is orbiting to a connected jump-gate waypoint in another system (see get_jump_gate for connections). Ship must be in orbit at the gate; one ANTIMATTER is bought from the gate's market per jump. Sets a cooldown.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), waypointSymbol: z.string() }),
  guards: [knownShip, notInTransit, inOrbit, cooldownClear],
  rateCost: 2,
  handler: async ({ shipSymbol, waypointSymbol }, ctx) => {
    const { data } = await api.jump(shipSymbol, waypointSymbol);
    observeAgent(data.agent);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, nav: data.nav, cooldown: data.cooldown });
    if (data.transaction) earnings.record(shipSymbol, -data.transaction.totalPrice, "fuel");
    expectArrival(shipSymbol, waypointSymbol, Date.now());
    return {
      summary: `${shipSymbol} jumped to ${waypointSymbol}, cooldown ${data.cooldown.totalSeconds}s`,
      result: data,
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} jump cooldown done`,
    };
  },
});

// ---- Surveys & survey extraction ----

registerTool({
  name: "create_survey",
  description: "Survey current waypoint for richer extraction yields (needs SURVEYOR mount; auto-orbits if docked). Returns surveys usable by extract_with_survey. Starts the ship's cooldown, so the same ship cannot extract until it ends (harness auto-wakes); survey with one ship and extract with another to avoid waiting.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, notInTransit, cooldownClear, shipHasMount("MOUNT_SURVEYOR")],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureOrbit(shipSymbol, ship);
    const { data } = await api.createSurvey(shipSymbol);
    if (ship && data.cooldown) upsertShip({ ...ship, cooldown: data.cooldown });
    const surveys = data.surveys ?? [];
    return {
      summary: `${shipSymbol} surveyed ${surveys.length} deposits (${surveys.map(s => s.symbol).join(", ")})${cooldownNote(data.cooldown)}`,
      result: surveys,
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} survey cooldown done`,
    };
  },
});

registerTool({
  name: "extract_with_survey",
  description: "Extract using a survey for better yields (needs MINING_LASER + a survey object from create_survey; auto-orbits if docked).",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), survey: surveySchema() }),
  guards: [knownShip, notInTransit, cooldownClear, shipHasMount("MOUNT_MINING_LASER")],
  rateCost: 2,
  handler: async ({ shipSymbol, survey }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureOrbit(shipSymbol, ship);
    const { data } = await api.extractWithSurvey(shipSymbol, survey as Survey);
    if (ship) upsertShip({ ...ship, cargo: data.cargo, cooldown: data.cooldown });
    return {
      summary: `${shipSymbol} extracted ${data.extraction.yield.units}x ${data.extraction.yield.symbol} (surveyed), cargo ${data.cargo.units}/${data.cargo.capacity}${cooldownNote(data.cooldown)}`,
      result: data,
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} extraction cooldown done`,
    };
  },
});

function surveySchema() {
  return z.object({
    signature: z.string(),
    symbol: z.string(),
    deposits: z.array(z.string()),
    expiration: z.string(),
    size: z.string(),
  }).passthrough();
}

// ---- Cargo transfer & refining ----

registerTool({
  name: "transfer_cargo",
  description: "Transfer cargo from shipSymbol to receiveShipSymbol. Both ships must be at the same waypoint; the sending ship auto-docks or auto-orbits to match the receiver.",
  kind: "action",
  input: z.object({
    shipSymbol: z.string(),
    tradeSymbol: z.string(),
    units: z.number().int().positive(),
    receiveShipSymbol: z.string(),
  }),
  guards: [knownShip, cargoHasGood, transferTargetReady],
  rateCost: 2,
  handler: async ({ shipSymbol, tradeSymbol, units, receiveShipSymbol }, ctx) => {
    // The API needs both ships in the same nav state. Only the sender is under
    // this call's ship lock, so move the sender to match the receiver.
    const ship = await ctx.fresh.ship(shipSymbol);
    const recv = await ctx.fresh.ship(receiveShipSymbol);
    if (recv?.nav.status === "DOCKED") await ensureDocked(shipSymbol, ship);
    else if (recv?.nav.status === "IN_ORBIT") await ensureOrbit(shipSymbol, ship);
    const { data } = await api.transferCargo(shipSymbol, tradeSymbol, units, receiveShipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    if (recv) upsertShip({ ...recv, cargo: data.targetCargo });
    return { summary: `${shipSymbol} → ${receiveShipSymbol}: ${units}x ${tradeSymbol}`, result: { cargo: compactCargo(data.cargo) } };
  },
});

registerTool({
  name: "refine",
  description: "Refine raw goods into processed goods (needs a refinery module: MICRO_REFINERY, ORE_REFINERY or FUEL_REFINERY). 100 raw units → 10 processed. Sets a cooldown.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), produceSymbol: z.string() }),
  guards: [knownShip, notInTransit, cooldownClear, shipHasModule("MODULE_MICRO_REFINERY", "MODULE_ORE_REFINERY", "MODULE_FUEL_REFINERY")],
  rateCost: 2,
  handler: async ({ shipSymbol, produceSymbol }, ctx) => {
    const { data } = await api.shipRefine(shipSymbol, produceSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo, cooldown: data.cooldown });
    return {
      summary: `${shipSymbol} refined → ${produceSymbol}, cargo ${data.cargo.units}/${data.cargo.capacity}`,
      result: data,
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} refine cooldown done`,
    };
  },
});

// ---- Contracts ----

registerTool({
  name: "negotiate_contract",
  description: "Negotiate a new contract offer (ship must be at a faction waypoint, e.g. HQ; auto-docks if in orbit). Only works when you have no active contract.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, notInTransit, noActiveContract],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    await ensureDocked(shipSymbol, await ctx.fresh.ship(shipSymbol));
    const { data } = await api.negotiateContract(shipSymbol);
    upsertContract(data.contract);
    return { summary: `negotiated contract ${data.contract.id.slice(0, 8)} (${data.contract.type})`, result: data.contract };
  },
});

// ---- Modules & mounts ----

const install = (name: string, apiFn: (s: string, sym: string) => Promise<{ data: any }>, kind: "module" | "mount") =>
  registerTool({
    name,
    description: `Install a ${kind} on a docked ship at a shipyard. Costs credits.`,
    kind: "action",
    input: z.object({ shipSymbol: z.string(), symbol: z.string() }),
    guards: [knownShip, isDocked, waypointHasTrait("SHIPYARD")],
    rateCost: 3,
    handler: async ({ shipSymbol, symbol }) => {
      const { data } = await apiFn(shipSymbol, symbol);
      observeAgent(data.agent);
      if (data.ship) upsertShip(data.ship);
      return { summary: `${shipSymbol} installed ${symbol} for ${data.transaction?.totalPrice ?? "?"} cr`, result: data };
    },
  });

const remove = (name: string, apiFn: (s: string, sym: string) => Promise<{ data: any }>, kind: "module" | "mount") =>
  registerTool({
    name,
    description: `Remove a ${kind} from a docked ship at a shipyard.`,
    kind: "action",
    input: z.object({ shipSymbol: z.string(), symbol: z.string() }),
    guards: [knownShip, isDocked, waypointHasTrait("SHIPYARD")],
    rateCost: 3,
    handler: async ({ shipSymbol, symbol }, ctx) => {
      const { data } = await apiFn(shipSymbol, symbol);
      if (data.ship) upsertShip(data.ship);
      if (data.cargo) {
        const ship = await ctx.fresh.ship(shipSymbol);
        if (ship) upsertShip({ ...ship, cargo: data.cargo });
      }
      return { summary: `${shipSymbol} removed ${symbol}`, result: data };
    },
  });

install("install_module", (s, sym) => api.installModule(s, sym), "module");
remove("remove_module", (s, sym) => api.removeModule(s, sym), "module");
install("install_mount", (s, sym) => api.installMount(s, sym), "mount");
remove("remove_mount", (s, sym) => api.removeMount(s, sym), "mount");

// ---- Repair & scrap ----

registerTool({
  name: "repair_ship",
  description: "Repair ship to full at a docked shipyard. Costs credits proportional to damage.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, isDocked, waypointHasTrait("SHIPYARD")],
  rateCost: 3,
  handler: async ({ shipSymbol }) => {
    const { data } = await api.repairShip(shipSymbol);
    observeAgent(data.agent);
    upsertShip(data.ship);
    return { summary: `${shipSymbol} repaired for ${data.transaction?.totalPrice ?? "?"} cr`, result: data };
  },
});

registerTool({
  name: "scrap_ship",
  description: "Scrap a docked ship for credits. PERMANENT — the ship is destroyed.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, isDocked, waypointHasTrait("SHIPYARD")],
  rateCost: 3,
  handler: async ({ shipSymbol }) => {
    const { data } = await api.scrapShip(shipSymbol);
    observeAgent(data.agent);
    removeShip(shipSymbol);
    return { summary: `${shipSymbol} scrapped for ${data.transaction?.totalPrice ?? "?"} cr`, result: data };
  },
});

// ---- Scans ----

const scan = (name: string, description: string, apiFn: (s: string) => Promise<{ data: any }>) =>
  registerTool({
    name,
    description,
    kind: "action",
    input: z.object({ shipSymbol: z.string() }),
    guards: [knownShip, inOrbit, cooldownClear, shipHasMount("MOUNT_SENSOR_ARRAY")],
    rateCost: 2,
    handler: async ({ shipSymbol }, ctx) => {
      const { data } = await apiFn(shipSymbol);
      const ship = await ctx.fresh.ship(shipSymbol);
      if (ship && data.cooldown) upsertShip({ ...ship, cooldown: data.cooldown });
      return {
        summary: `${shipSymbol} scan complete`,
        result: data,
        followUpWakeAt: cooldownWakeAt(data.cooldown),
        followUpReason: `${shipSymbol} scan cooldown done`,
      };
    },
  });

scan("scan_systems", "Scan for nearby systems (needs orbit + SENSOR_ARRAY mount).", s => api.scanSystems(s));
scan("scan_waypoints", "Scan for detailed waypoints in current system (needs orbit + SENSOR_ARRAY).", s => api.scanWaypoints(s));
scan("scan_ships", "Scan for ships at current waypoint (needs orbit + SENSOR_ARRAY).", s => api.scanShips(s));
