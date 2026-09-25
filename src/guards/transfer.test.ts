import { test } from "node:test";
import assert from "node:assert/strict";
import { transferTargetReady, type FreshReader } from "./index.js";
import type { Ship } from "../generated/types.js";

function ship(symbol: string, waypointSymbol: string, status: Ship["nav"]["status"], units = 0, capacity = 40): Ship {
  return { symbol, nav: { waypointSymbol, status }, cargo: { units, capacity, inventory: [] } } as unknown as Ship;
}

function reader(...ships: Ship[]): FreshReader {
  return {
    ship: async s => ships.find(x => x.symbol === s),
    market: async () => undefined,
    waypoint: async () => undefined,
    shipyard: async () => undefined,
    agent: async () => undefined,
  };
}

const args = { shipSymbol: "TEAR-5", tradeSymbol: "SILICON_CRYSTALS", units: 3, receiveShipSymbol: "TEAR-1" };
const check = (...ships: Ship[]) => transferTargetReady("transfer_cargo", { args, fresh: reader(...ships) });

test("allows ships at the same waypoint, even in different nav states", async () => {
  const r = await check(ship("TEAR-5", "X1-A-B1", "IN_ORBIT"), ship("TEAR-1", "X1-A-B1", "DOCKED"));
  assert.equal(r.ok, true);
});

test("refuses when the receiving ship is elsewhere", async () => {
  const r = await check(ship("TEAR-5", "X1-A-B1", "IN_ORBIT"), ship("TEAR-1", "X1-A-B7", "IN_ORBIT"));
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /same waypoint/);
});

test("refuses when the receiving ship is in transit", async () => {
  const r = await check(ship("TEAR-5", "X1-A-B1", "IN_ORBIT"), ship("TEAR-1", "X1-A-B1", "IN_TRANSIT"));
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /TEAR-1 in transit/);
});

test("refuses when the receiving ship has no room", async () => {
  const r = await check(ship("TEAR-5", "X1-A-B1", "DOCKED"), ship("TEAR-1", "X1-A-B1", "DOCKED", 39, 40));
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /only 1 cargo space free/);
});

test("refuses an unknown receiving ship", async () => {
  const r = await check(ship("TEAR-5", "X1-A-B1", "DOCKED"));
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /unknown receiving ship TEAR-1/);
});
