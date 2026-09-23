import { z } from "zod";
import { api } from "../client/index.js";
import { mirror, storeKeys, upsertShip } from "../state/store.js";
import { registerTool } from "./registry.js";
import {
  cargoHasGood, cargoHasRoom, cooldownClear, hasFuelForRoute, inOrbit, isDocked,
  knownShip, marketSellsFuel, marketTrades, notInTransit, shipHasMount, waypointHasTrait,
} from "../guards/index.js";
import { cooldownWakeAt, etaWakeAt } from "../utils/time.js";
import type { ShipNavFlightMode } from "../generated/types.js";

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
  description: "Fly ship to another waypoint in the same system. Optional flightMode: CRUISE (default), BURN (2x speed, more fuel), DRIFT (no fuel, slow). Harness wakes on arrival.",
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
  description: "Refuel ship to full. Must be docked at a waypoint selling FUEL.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, isDocked, waypointHasTrait("MARKETPLACE"), marketSellsFuel],
  rateCost: 4,
  handler: async ({ shipSymbol }, ctx) => {
    const { data } = await api.refuel(shipSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, fuel: data.fuel });
    return { summary: `${shipSymbol} +${data.transaction.units} fuel for ${data.transaction.totalPrice} cr`, result: { fuel: data.fuel, transaction: data.transaction } };
  },
});

registerTool({
  name: "extract",
  description: "Extract ore at current waypoint (needs orbit + MINING_LASER mount). Returns cooldown; harness auto-wakes when it ends.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, inOrbit, cooldownClear, shipHasMount("MOUNT_MINING_LASER")],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const { data } = await api.extract(shipSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo, cooldown: data.cooldown });
    return {
      summary: `${shipSymbol} extracted ${data.extraction.yield.units}x ${data.extraction.yield.symbol}, cargo ${data.cargo.units}/${data.cargo.capacity}`,
      result: { extraction: data.extraction, cooldown: data.cooldown, cargo: data.cargo },
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} extraction cooldown done`,
    };
  },
});

registerTool({
  name: "siphon",
  description: "Siphon gas at current waypoint (needs orbit + GAS_SIPHON mount). Returns cooldown; harness auto-wakes when it ends.",
  kind: "action",
  input: z.object({ shipSymbol: z.string() }),
  guards: [knownShip, inOrbit, cooldownClear, shipHasMount("MOUNT_GAS_SIPHON")],
  rateCost: 2,
  handler: async ({ shipSymbol }, ctx) => {
    const { data } = await api.siphon(shipSymbol);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo, cooldown: data.cooldown });
    return {
      summary: `${shipSymbol} siphoned ${data.siphon.yield.units}x ${data.siphon.yield.symbol}`,
      result: { siphon: data.siphon, cooldown: data.cooldown, cargo: data.cargo },
      followUpWakeAt: cooldownWakeAt(data.cooldown),
      followUpReason: `${shipSymbol} siphon cooldown done`,
    };
  },
});

registerTool({
  name: "buy_cargo",
  description: "Buy units of a trade good into ship cargo. Must be docked at a market that EXPORTs/EXCHANGEs it.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), symbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, isDocked, waypointHasTrait("MARKETPLACE"), marketTrades("buy"), cargoHasRoom()],
  rateCost: 4,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const { data } = await api.purchaseCargo(shipSymbol, symbol, units);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    return { summary: `${shipSymbol} bought ${units}x ${symbol} for ${data.transaction.totalPrice} cr`, result: { cargo: data.cargo, transaction: data.transaction } };
  },
});

registerTool({
  name: "sell_cargo",
  description: "Sell units of a trade good from ship cargo. Must be docked at a market that IMPORTs/EXCHANGEs it.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), symbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, isDocked, waypointHasTrait("MARKETPLACE"), marketTrades("sell"), cargoHasGood],
  rateCost: 4,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const { data } = await api.sellCargo(shipSymbol, symbol, units);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    return { summary: `${shipSymbol} sold ${units}x ${symbol} for ${data.transaction.totalPrice} cr`, result: { cargo: data.cargo, transaction: data.transaction } };
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
    return { summary: `${shipSymbol} jettisoned ${units}x ${symbol}`, result: { cargo: data.cargo } };
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
    mirror.invalidate(storeKeys.contracts);
    return { summary: `accepted ${contractId} (+${data.contract.terms.payment.onAccepted} upfront)`, result: data.contract };
  },
});

registerTool({
  name: "deliver_contract_cargo",
  description: "Deliver cargo from a ship toward an accepted contract. Ship must be at the contract's destination waypoint.",
  kind: "action",
  input: z.object({ contractId: z.string(), shipSymbol: z.string(), tradeSymbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, cargoHasGood],
  rateCost: 2,
  handler: async ({ contractId, shipSymbol, tradeSymbol, units }, ctx) => {
    const { data } = await api.deliverContract(contractId, shipSymbol, tradeSymbol, units);
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    mirror.invalidate(storeKeys.contracts);
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
    mirror.invalidate(storeKeys.contracts);
    return { summary: `fulfilled ${contractId} (+${data.contract.terms.payment.onFulfilled} cr)`, result: data.contract };
  },
});

registerTool({
  name: "purchase_ship",
  description: "Buy a ship type at a shipyard waypoint. Costs a lot of credits — verify credit balance and shipyard stock first.",
  kind: "action",
  input: z.object({ shipType: z.string(), waypointSymbol: z.string() }),
  guards: [],
  rateCost: 1,
  handler: async ({ shipType, waypointSymbol }) => {
    const { data } = await api.purchaseShip(shipType, waypointSymbol);
    upsertShip(data.ship);
    mirror.invalidate(storeKeys.agent);
    return { summary: `purchased ${data.ship.symbol} (${shipType}) for ${data.transaction?.price ?? "?"} cr`, result: data };
  },
});
