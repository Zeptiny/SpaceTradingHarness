import { test } from "node:test";
import assert from "node:assert/strict";
import { distance, fuelCost } from "./nav.js";

test("fuel cost scales with flight mode", () => {
  assert.equal(fuelCost(40.4, "CRUISE"), 40);
  assert.equal(fuelCost(40.4, "STEALTH"), 40);
  assert.equal(fuelCost(40.4, "BURN"), 80);
});

test("DRIFT always costs one fuel, so a stranded ship can still move", () => {
  assert.equal(fuelCost(0, "DRIFT"), 1);
  assert.equal(fuelCost(500, "DRIFT"), 1);
});

test("distance is euclidean", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});
