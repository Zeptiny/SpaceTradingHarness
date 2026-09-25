import { test } from "node:test";
import assert from "node:assert/strict";
import { planClearCargo } from "./cargo.js";

const market = [
  { symbol: "IRON_ORE", type: "IMPORT", tradeVolume: 10, youGet: 70 },
  { symbol: "FUEL", type: "EXCHANGE", tradeVolume: 100, youGet: 70 },
  { symbol: "ALUMINUM", type: "EXPORT", tradeVolume: 10, youGet: 200 },
];

test("sells what the market buys in tradeVolume chunks, jettisons listed junk, keeps the rest", () => {
  const plan = planClearCargo(
    [{ symbol: "IRON_ORE", units: 25 }, { symbol: "QUARTZ_SAND", units: 6 }, { symbol: "ALUMINUM", units: 3 }, { symbol: "COPPER_ORE", units: 4 }],
    market,
    { jettison: ["QUARTZ_SAND"], keep: ["COPPER_ORE"] },
  );
  assert.deepEqual(plan.sells, [{ symbol: "IRON_ORE", units: 10 }, { symbol: "IRON_ORE", units: 10 }, { symbol: "IRON_ORE", units: 5 }]);
  assert.deepEqual(plan.jettison, [{ symbol: "QUARTZ_SAND", units: 6 }]);
  assert.deepEqual(plan.kept.map(k => [k.symbol, k.why]), [["ALUMINUM", "market doesn't buy it"], ["COPPER_ORE", "keep"]]);
});

test("goods limits the sale to the listed goods", () => {
  const plan = planClearCargo([{ symbol: "IRON_ORE", units: 5 }, { symbol: "FUEL", units: 2 }], market, { goods: ["FUEL"] });
  assert.deepEqual(plan.sells, [{ symbol: "FUEL", units: 2 }]);
  assert.equal(plan.kept[0]?.why, "not listed");
});
