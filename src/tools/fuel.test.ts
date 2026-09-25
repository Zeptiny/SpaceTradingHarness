import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldTopUp } from "./fuel.js";

const base = { current: 200, capacity: 400, need: 100, price: 70, cheapest: 70, maxPremium: 0.15 };

test("tops up at a fair price", () => assert.equal(shouldTopUp(base).refuel, true));
test("skips when the tank is full or absent", () => {
  assert.equal(shouldTopUp({ ...base, current: 400 }).refuel, false);
  assert.equal(shouldTopUp({ ...base, capacity: 0, current: 0 }).refuel, false);
});
test("skips an overpriced market unless the leg needs it", () => {
  assert.equal(shouldTopUp({ ...base, price: 90 }).refuel, false);
  assert.equal(shouldTopUp({ ...base, price: 90, need: 300 }).refuel, true);
});
