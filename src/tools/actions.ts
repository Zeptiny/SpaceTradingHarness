import { z } from "zod";
import { api } from "../client/index.js";
import { observeAgent, upsertContract, upsertShip } from "../state/store.js";
import { registerTool } from "./registry.js";
import {
  canBuyShip, cargoHasGood, cargoHasRoom, cooldownClear, hasFuelForRoute, inOrbit, isDocked,
  knownShip, marketSellsFuel, marketTrades, notInTransit, shipHasMount,
} from "../guards/index.js";
import { ensureDocked, ensureOrbit } from "./navstate.js";
import { config } from "../config.js";
import { cooldownNote, cooldownWakeAt, etaWakeAt } from "../utils/time.js";
import { compactCargo, compactShip } from "../state/projections.js";
import { ledger } from "../state/ledger.js";
import { ShipTypeValues, type ShipNavFlightMode } from "../generated/types.js";

registerTool({
  name: "dock",
  description: "Dock ship at current waypoint. Required before trade/refuel/repair.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, inOrbit],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const { data } = await api.dock(shipSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, nav: data.nav });
    return { summary: `${shipSymbol} docked at ${data.nav.waypointSymbol}`, result: { nav: data.nav } };
  },
});

registerTool({
  name: "orbit",
  description: "Move ship to orbit. Required before extract/siphon/scan.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, isDocked],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const { data } = await api.orbit(shipSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, nav: data.nav });
    return { summary: `${shipSymbol} in orbit at ${data.nav.waypointSymbol}`, result: { nav: data.nav } };
  },
});

registerTool({
  name: "navigate",
  description: "Fly ship to another waypoint in the same system (auto-orbits if docked). Optional flightMode: CRUISE (fuel ≈ distance), BURN (faster, 2× fuel), DRIFT (1 fuel, very slow — use when stranded). Without flightMode the ship's current mode is kept. Harness wakes on arrival.",
  kind: "action",
  input: z.object({
    shipSymbol: z.string(),
    waypointSymbol: z.string(),
    flightMode: z.enum(["CRUISE", "BURN", "DRIFT"]).optional(),
  }),
  guards: [knownShip, notInTransit, hasFuelForRoute],
  rateCost: 4,
  handler: async ({ shipSymbol, waypointSymbol, flightMode }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureOrbit(shipSymbol, ship);
    if (flightMode && ship && ship.nav.flightMode !== flightMode) {
      await api.patchNav(shipSymbol, flightMode as ShipNavFlightMode);
    }
    const { data } = await api.navigate(shipSymbol, waypointSymbol);
    if (ship) upsertShip({ ...ship, nav: data.nav, fuel: data.fuel });
    return {
      summary: `${shipSymbol} in transit to ${waypointSymbol} (${flightMode ?? "CRUISE"}), fuel ${data.fuel.current}/${data.fuel.capacity}`,
      result: { nav: data.nav, fuel: data.fuel },
      followUpWakeAt: etaWakeAt(data.nav),
      followUpReason: `${shipSymbol} arrival at ${waypointSymbol}`,
    };
  },
});

registerTool({
  name: "refuel",
  description: "Refuel ship to full at a waypoint selling FUEL (auto-docks if in orbit).",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, notInTransit, marketSellsFuel],
  rateCost: 4,
  handler: async ({ shipSymbol }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureDocked(shipSymbol, ship);
    const { data } = await api.refuel(shipSymbol);
    observeAgent(data.agent);
    if (ship) upsertShip({ ...ship, fuel: data.fuel });
    return { summary: `${shipSymbol} +${data.transaction.units} fuel for ${data.transaction.totalPrice} cr`, result: { fuel: data.fuel, transaction: data.transaction } };
  },
});

registerTool({
  name: "extract",
  description: "Extract ore at current waypoint (needs MINING_LASER mount; auto-orbits if docked). Returns cooldown; harness auto-wakes when it ends.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, notInTransit, cooldownClear, shipHasMount("MOUNT_MINING_LASER")],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureOrbit(shipSymbol, ship);
    const { data } = await api.extract(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo, cooldown: data.cooldown });
    return {
      summary: `${shipSymbol} extracted ${data.extraction.yield.units}x ${data.extraction.yield.symbol}, cargo ${data.cargo.units}/${data.cargo.capacity}${cooldownNote(data.cooldown)}`,
      result: { extraction: data.extraction, cooldown: data.cooldown, cargo: data.cargo },
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} extraction cooldown done`,
    };
  },
});

registerTool({
  name: "siphon",
  description: "Siphon gas at current waypoint (needs GAS_SIPHON mount; auto-orbits if docked). Returns cooldown; harness auto-wakes when it ends.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, notInTransit, cooldownClear, shipHasMount("MOUNT_GAS_SIPHON")],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureOrbit(shipSymbol, ship);
    const { data } = await api.siphon(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo, cooldown: data.cooldown });
    return {
      summary: `${shipSymbol} siphoned ${data.siphon.yield.units}x ${data.siphon.yield.symbol}${cooldownNote(data.cooldown)}`,
      result: { siphon: data.siphon, cooldown: data.cooldown, cargo: data.cargo },
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} siphon cooldown done`,
    };
  },
});

registerTool({
  name: "buy_cargo",
  description: "Buy units of a trade good into ship cargo at a market that EXPORTs/EXCHANGEs it (auto-docks if in orbit). Units per call are capped by the good's tradeVolume.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), symbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, notInTransit, marketTrades("buy"), cargoHasRoom()],
  rateCost: 4,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureDocked(shipSymbol, ship);
    const { data } = await api.purchaseCargo(shipSymbol, symbol, units);
    observeAgent(data.agent);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    return {
      summary: `${shipSymbol} bought ${units}x ${symbol} for ${data.transaction.totalPrice} cr`,
      result: { cargo: compactCargo(data.cargo), transaction: data.transaction, credits: data.agent.credits },
    };
  },
});

registerTool({
  name: "sell_cargo",
  description: "Sell units of a trade good from ship cargo at a market that IMPORTs/EXCHANGEs it (auto-docks if in orbit). Units per call are capped by the good's tradeVolume.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), symbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, notInTransit, marketTrades("sell"), cargoHasGood],
  rateCost: 4,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureDocked(shipSymbol, ship);
    const { data } = await api.sellCargo(shipSymbol, symbol, units);
    observeAgent(data.agent);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    return {
      summary: `${shipSymbol} sold ${units}x ${symbol} for ${data.transaction.totalPrice} cr`,
      result: { cargo: compactCargo(data.cargo), transaction: data.transaction, credits: data.agent.credits },
    };
  },
});

registerTool({
  name: "jettison",
  description: "Throw cargo overboard (ship must be in orbit). Irreversible.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), symbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, inOrbit, cargoHasGood],
  rateCost: 2,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const { data } = await api.jettison(shipSymbol, symbol, units);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    return { summary: `${shipSymbol} jettisoned ${units}x ${symbol}`, result: { cargo: compactCargo(data.cargo) } };
  },
});

registerTool({
  name: "accept_contract",
  description: "Accept an offered contract by id.",
  kind: "action",
  input: z.object({ contractId: z.string() }),
  rateCost: 1,
  handler: async ({ contractId }) => {
    const { data } = await api.acceptContract(contractId);
    observeAgent(data.agent);
    upsertContract(data.contract);
    return { summary: `accepted ${contractId} (+${data.contract.terms.payment.onAccepted} upfront)`, result: data.contract };
  },
});

registerTool({
  name: "deliver_contract_cargo",
  description: "Deliver cargo from a ship toward an accepted contract. Ship must be at the contract's destination waypoint (auto-docks if in orbit).",
  kind: "action",
  input: z.object({ contractId: z.string(), shipSymbol: z.string(), tradeSymbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, notInTransit, cargoHasGood],
  rateCost: 2,
  handler: async ({ contractId, shipSymbol, tradeSymbol, units }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureDocked(shipSymbol, ship);
    const { data } = await api.deliverContract(contractId, shipSymbol, tradeSymbol, units);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    upsertContract(data.contract);
    return { summary: `delivered ${units}x ${tradeSymbol} to ${contractId}`, result: data.contract };
  },
});

registerTool({
  name: "fulfill_contract",
  description: "Fulfill a fully-delivered contract to collect payment.",
  kind: "action",
  input: z.object({ contractId: z.string() }),
  rateCost: 1,
  handler: async ({ contractId }) => {
    const { data } = await api.fulfillContract(contractId);
    observeAgent(data.agent);
    upsertContract(data.contract);
    return { summary: `fulfilled ${contractId} (+${data.contract.terms.payment.onFulfilled} cr)`, result: data.contract };
  },
});

registerTool({
  name: "purchase_ship",
  description: `Buy a new ship at a shipyard waypoint — the main way to grow income. One of your ships must be at that waypoint. The guard checks the type is sold there and that the price leaves at least the ${config.agent.creditReserve} cr reserve. The new ship starts docked there; give it a job right away.`,
  kind: "action",
  input: z.object({ shipType: z.enum(ShipTypeValues), waypointSymbol: z.string() }),
  guards: [canBuyShip(config.agent.creditReserve)],
  rateCost: 3,
  handler: async ({ shipType, waypointSymbol }) => {
    const { data } = await api.purchaseShip(shipType, waypointSymbol);
    upsertShip(data.ship);
    observeAgent(data.agent);
    ledger.recordShipPurchase(data.transaction.price);
    return {
      summary: `purchased ${data.ship.symbol} (${shipType}) at ${waypointSymbol} for ${data.transaction.price} cr; credits now ${data.agent.credits}`,
      result: { ship: compactShip(data.ship), credits: data.agent.credits, price: data.transaction.price },
    };
  },
});
