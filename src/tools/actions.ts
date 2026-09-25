import { z } from "zod";
import { api } from "../client/index.js";
import { observeAgent, upsertContract, upsertShip } from "../state/store.js";
import { registerTool } from "./registry.js";
import {
  canAffordCargo, canBuyShip, cargoHasGood, cargoHasRoom, cooldownClear, hasFuelForRoute, inOrbit, isDocked,
  knownShip, marketSellsFuel, marketTrades, notInTransit, shipHasMount,
} from "../guards/index.js";
import { ensureDocked, ensureOrbit } from "./navstate.js";
import { config } from "../config.js";
import { cooldownNote, cooldownWakeAt, etaWakeAt } from "../utils/time.js";
import { compactCargo, compactShip, contractSummary } from "../state/projections.js";
import { ledger } from "../state/ledger.js";
import { ShipTypeValues, type ShipNavFlightMode } from "../generated/types.js";
import { earnings } from "../state/earnings.js";
import { expectArrival } from "../state/arrivals.js";
import { atlas } from "../state/atlas.js";
import { systemOf } from "../utils/symbols.js";
import { distance, fuelCost } from "../utils/nav.js";
import { topUpBeforeDeparture } from "./fuel.js";
import { autoFulfill } from "./contracts.js";
import { planClearCargo } from "../utils/cargo.js";

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
  description: "Fly ship to another waypoint in the same system (auto-orbits if docked). Before leaving a market that sells fuel it tops up the tank (set refuel false to skip). Optional flightMode: CRUISE (fuel ≈ distance), BURN (faster, 2× fuel), DRIFT (1 fuel, very slow — use when stranded). Without flightMode the ship's current mode is kept. The harness reads the destination market on arrival and wakes you. For far or cross-system destinations use goto, which plans fuel stops and jumps.",
  kind: "action",
  input: z.object({
    shipSymbol: z.string(),
    waypointSymbol: z.string(),
    flightMode: z.enum(["CRUISE", "BURN", "DRIFT"]).optional(),
    refuel: z.boolean().optional(),
  }),
  guards: [knownShip, notInTransit, hasFuelForRoute],
  rateCost: 4,
  handler: async ({ shipSymbol, waypointSymbol, flightMode, refuel }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    if (ship && ship.nav.waypointSymbol === waypointSymbol) {
      return { summary: `${shipSymbol} is already at ${waypointSymbol}; no flight needed`, result: { nav: compactShip(ship).nav, fuel: ship.fuel } };
    }
    let refueled: string | null = null;
    if (ship) {
      const from = atlas.get(ship.nav.waypointSymbol) ?? await ctx.fresh.waypoint(systemOf(ship.nav.waypointSymbol), ship.nav.waypointSymbol);
      const to = atlas.get(waypointSymbol) ?? await ctx.fresh.waypoint(systemOf(waypointSymbol), waypointSymbol);
      const mode = (flightMode ?? ship.nav.flightMode) as ShipNavFlightMode;
      const need = from && to ? fuelCost(distance(from, to), mode) : 0;
      refueled = await topUpBeforeDeparture(shipSymbol, ship, ctx.fresh, need, refuel !== false);
    }
    await ensureOrbit(shipSymbol, ship);
    if (flightMode && ship && ship.nav.flightMode !== flightMode) {
      await api.patchNav(shipSymbol, flightMode as ShipNavFlightMode);
    }
    const { data } = await api.navigate(shipSymbol, waypointSymbol);
    if (ship) upsertShip({ ...ship, nav: data.nav, fuel: data.fuel });
    expectArrival(shipSymbol, waypointSymbol, data.nav.route?.arrival);
    return {
      summary: `${shipSymbol} in transit to ${waypointSymbol} (${data.nav.flightMode}), fuel ${data.fuel.current}/${data.fuel.capacity}${refueled ? `; ${refueled} before leaving` : ""}`,
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
    earnings.record(shipSymbol, -data.transaction.totalPrice, "fuel");
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
  guards: [knownShip, notInTransit, marketTrades("buy"), cargoHasRoom(), canAffordCargo],
  rateCost: 4,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureDocked(shipSymbol, ship);
    const { data } = await api.purchaseCargo(shipSymbol, symbol, units);
    observeAgent(data.agent);
    if (ship) upsertShip({ ...ship, cargo: data.cargo });
    earnings.record(shipSymbol, -data.transaction.totalPrice, "trade");
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
    earnings.record(shipSymbol, data.transaction.totalPrice, "trade");
    return {
      summary: `${shipSymbol} sold ${units}x ${symbol} for ${data.transaction.totalPrice} cr`,
      result: { cargo: compactCargo(data.cargo), transaction: data.transaction, credits: data.agent.credits },
    };
  },
});

registerTool({
  name: "sell_all",
  description: "Clear a ship's hold in one call: sells every cargo good this market buys (split into tradeVolume-sized sales), then jettisons goods named in jettison that it can't sell. goods limits it to those goods; keep lists goods to hold on to (e.g. contract cargo). Auto-docks, and auto-orbits to jettison.",
  kind: "action",
  input: z.object({
    shipSymbol: z.string(),
    goods: z.array(z.string()).optional(),
    keep: z.array(z.string()).optional(),
    jettison: z.array(z.string()).optional(),
  }),
  guards: [knownShip, notInTransit],
  rateCost: 6,
  handler: async ({ shipSymbol, goods, keep, jettison }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    if (!ship) throw new Error(`unknown ship ${shipSymbol}`);
    const here = ship.nav.waypointSymbol;
    const hasMarket = atlas.get(here)?.traits.includes("MARKETPLACE") ?? true;
    const market = hasMarket ? await ctx.fresh.market(systemOf(here), here) : undefined;
    const plan = planClearCargo(
      ship.cargo.inventory,
      market?.tradeGoods?.map(g => ({ symbol: g.symbol, type: g.type, tradeVolume: g.tradeVolume, youGet: g.sellPrice })) ?? null,
      { goods, keep, jettison },
    );
    let revenue = 0;
    const sold = new Map<string, number>();
    let cargo = ship.cargo;
    const failed: string[] = [];
    if (plan.sells.length) await ensureDocked(shipSymbol, ship);
    for (const s of plan.sells) {
      try {
        const { data } = await api.sellCargo(shipSymbol, s.symbol, s.units);
        observeAgent(data.agent);
        cargo = data.cargo;
        revenue += data.transaction.totalPrice;
        sold.set(s.symbol, (sold.get(s.symbol) ?? 0) + s.units);
        earnings.record(shipSymbol, data.transaction.totalPrice, "trade");
      } catch (err) {
        failed.push(`${s.symbol}: ${err instanceof Error ? err.message : err}`);
        break; // the rest of this good (and later ones) would likely fail the same way
      }
    }
    const dumped: string[] = [];
    if (plan.jettison.length) {
      await ensureOrbit(shipSymbol, ship);
      for (const j of plan.jettison) {
        const { data } = await api.jettison(shipSymbol, j.symbol, j.units);
        cargo = data.cargo;
        dumped.push(`${j.units}x ${j.symbol}`);
      }
    }
    upsertShip({ ...ship, cargo });
    const soldText = [...sold].map(([g, u]) => `${u}x ${g}`).join(", ");
    const parts = [
      soldText ? `sold ${soldText} for ${revenue} cr` : "sold nothing",
      dumped.length ? `jettisoned ${dumped.join(", ")}` : "",
      plan.kept.length ? `kept ${plan.kept.map(k => `${k.units}x ${k.symbol} (${k.why})`).join(", ")}` : "",
      failed.length ? `stopped on error: ${failed.join("; ")}` : "",
    ].filter(Boolean);
    return {
      summary: `${shipSymbol} at ${here}: ${parts.join("; ")}`,
      result: { revenue, cargo: compactCargo(cargo) },
    };
  },
});

registerTool({
  name: "jettison",
  description: "Throw cargo overboard (auto-orbits if docked). Irreversible. To dump several goods at once use sell_all with jettison.",
  kind: "action",
  input: z.object({ shipSymbol: z.string(), symbol: z.string(), units: z.number().int().positive() }),
  guards: [knownShip, notInTransit, cargoHasGood],
  rateCost: 2,
  handler: async ({ shipSymbol, symbol, units }, ctx) => {
    const ship = await ctx.fresh.ship(shipSymbol);
    await ensureOrbit(shipSymbol, ship);
    const { data } = await api.jettison(shipSymbol, symbol, units);
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
    earnings.record("(contracts)", data.contract.terms.payment.onAccepted, "contract");
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
    const d = data.contract.terms.deliver?.find(x => x.tradeSymbol === tradeSymbol);
    const progress = d ? ` (${d.unitsFulfilled}/${d.unitsRequired})` : "";
    const auto = await autoFulfill(data.contract, shipSymbol);
    return {
      summary: `delivered ${units}x ${tradeSymbol} to ${contractId.slice(0, 8)}${progress}${auto.note ? `; ${auto.note}` : ""}`,
      result: { contract: contractSummary(auto.fulfilled ?? data.contract), newOffer: auto.offer ? contractSummary(auto.offer) : undefined },
    };
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
    earnings.record("(contracts)", data.contract.terms.payment.onFulfilled, "contract");
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
    earnings.recordPurchase(data.ship.symbol, data.transaction.price);
    return {
      summary: `purchased ${data.ship.symbol} (${shipType}) at ${waypointSymbol} for ${data.transaction.price} cr; credits now ${data.agent.credits}`,
      result: { ship: compactShip(data.ship), credits: data.agent.credits, price: data.transaction.price },
    };
  },
});
