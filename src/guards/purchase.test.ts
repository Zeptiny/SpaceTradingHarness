import { test } from "node:test";
import assert from "node:assert/strict";
import { canBuyShip, type FreshReader } from "./index.js";
import type { Agent, Shipyard } from "../generated/types.js";

function reader(yard: Partial<Shipyard> | undefined, credits: number): FreshReader {
  return {
    ship: async () => undefined,
    market: async () => undefined,
    waypoint: async () => undefined,
    shipyard: async () => (yard ? ({ symbol: "X1-A-B1", modificationsFee: 0, shipTypes: [], ...yard } as Shipyard) : undefined),
    agent: async () => ({ credits } as Agent),
  };
}

const args = { shipType: "SHIP_LIGHT_HAULER", waypointSymbol: "X1-A-B1" };
const priced = {
  shipTypes: [{ type: "SHIP_LIGHT_HAULER" as const }],
  ships: [{ type: "SHIP_LIGHT_HAULER", purchasePrice: 100_000 }] as NonNullable<Shipyard["ships"]>,
};

test("allows a purchase that keeps the reserve", async () => {
  const r = await canBuyShip(25_000)("purchase_ship", { args, fresh: reader(priced, 150_000) });
  assert.equal(r.ok, true);
});

test("refuses a purchase that dips below the reserve", async () => {
  const r = await canBuyShip(25_000)("purchase_ship", { args, fresh: reader(priced, 120_000) });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /reserve/);
});

test("refuses when no ship is present (prices hidden)", async () => {
  const r = await canBuyShip(25_000)("purchase_ship", { args, fresh: reader({ shipTypes: priced.shipTypes }, 500_000) });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /navigate one there/);
});

test("refuses a type the shipyard does not sell", async () => {
  const r = await canBuyShip(0)("purchase_ship", {
    args: { ...args, shipType: "SHIP_PROBE" },
    fresh: reader(priced, 500_000),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /does not sell/);
});
