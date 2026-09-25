import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTradeLeads, type PricePoint } from "./prices.js";
import { computeTrend } from "./ledger.js";

const now = 1_000_000_000;
const pt = (waypoint: string, good: string, buy: number, sell: number, type: string, volume = 10, ageMin = 5): PricePoint => ({
  waypoint, good, purchasePrice: buy, sellPrice: sell, volume, type, ts: now - ageMin * 60_000,
});

test("trade leads pair an export source with an import sink, best profit first", () => {
  const leads = computeTradeLeads([
    pt("A", "IRON", 50, 40, "EXPORT", 20),
    pt("B", "IRON", 120, 100, "IMPORT", 10),
    pt("A", "COPPER", 30, 25, "EXPORT"),
    pt("C", "COPPER", 45, 40, "IMPORT"),
  ], { now, distance: (a, b) => (a === "A" && b === "B" ? 42 : null) });
  assert.equal(leads.length, 2);
  assert.deepEqual(
    { good: leads[0]!.good, buyAt: leads[0]!.buyAt, sellAt: leads[0]!.sellAt, margin: leads[0]!.marginPerUnit, units: leads[0]!.unitsPerTrade, profit: leads[0]!.profitPerTrade, distance: leads[0]!.distance },
    { good: "IRON", buyAt: "A", sellAt: "B", margin: 50, units: 10, profit: 500, distance: 42 },
  );
});

test("trade leads skip unprofitable, reversed and stale pairs", () => {
  const leads = computeTradeLeads([
    pt("A", "IRON", 50, 40, "EXPORT"),
    pt("B", "IRON", 45, 45, "IMPORT"), // sells for less than we pay
    pt("C", "FUEL", 10, 8, "IMPORT"), // import market is not a source
    pt("D", "FUEL", 30, 20, "EXPORT"), // export market is not a sink
    pt("E", "GOLD", 10, 5, "EXPORT", 10, 60 * 30),
    pt("F", "GOLD", 90, 80, "IMPORT"), // source too old
  ], { now });
  assert.equal(leads.length, 0);
});

test("trend counts ship purchases as earnings, not losses", () => {
  const h = 3600_000;
  const samples = [
    { ts: now - 2 * h, credits: 100_000, fleetSize: 2 },
    { ts: now - h, credits: 150_000, fleetSize: 2 },
    { ts: now, credits: 90_000, fleetSize: 3 },
  ];
  const t = computeTrend(samples, [{ ts: now - h / 2, price: 80_000 }], 1.5 * h, now);
  assert.ok(t);
  assert.equal(t.creditsDelta, -60_000);
  assert.equal(t.earned, 20_000);
  assert.equal(t.earnedPerHour, 20_000);
  assert.equal(t.fleetDelta, 1);
});

test("trend is null with a single sample", () => {
  assert.equal(computeTrend([{ ts: now, credits: 1, fleetSize: 1 }], [], 3600_000, now), null);
});
