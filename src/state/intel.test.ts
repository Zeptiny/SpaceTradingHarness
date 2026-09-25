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

test("trade leads carry supply at both ends and other agents' traffic on the route", () => {
  const leads = computeTradeLeads([
    { ...pt("A", "IRON", 50, 40, "EXPORT", 20), supply: "SCARCE" },
    { ...pt("B", "IRON", 120, 100, "IMPORT", 10), supply: "ABUNDANT" },
    pt("A", "COPPER", 30, 25, "EXPORT"),
    pt("C", "COPPER", 45, 40, "IMPORT"),
  ], { now, competition: (good, buyAt, sellAt) => (good === "IRON" && buyAt === "A" && sellAt === "B" ? 60 : null) });
  const iron = leads.find(l => l.good === "IRON")!;
  assert.equal(iron.buySupply, "SCARCE");
  assert.equal(iron.sellSupply, "ABUNDANT");
  assert.equal(iron.othersTradedLastHour, 60);
  assert.equal(leads.find(l => l.good === "COPPER")!.othersTradedLastHour, undefined);
});

test("route competition counts other agents' buys at the source and sells at the sink, not ours", async () => {
  const { prices, routeCompetition } = await import("./prices.js");
  const t = Date.parse("2026-09-25T12:00:00Z");
  const tx = (wp: string, ship: string, type: "PURCHASE" | "SELL", units: number, minsAgo: number) => ({
    waypointSymbol: wp, shipSymbol: ship, tradeSymbol: "ZINC", type, units, pricePerUnit: 10, totalPrice: 10 * units,
    timestamp: new Date(t - minsAgo * 60_000).toISOString(),
  });
  const market = (wp: string, transactions: ReturnType<typeof tx>[]) =>
    ({ symbol: wp, exports: [], imports: [], exchange: [], tradeGoods: [], transactions }) as unknown as import("../generated/types.js").Market;
  prices.record(market("ZX-SRC", [tx("ZX-SRC", "RIVAL-1", "PURCHASE", 30, 10), tx("ZX-SRC", "ME-1", "PURCHASE", 40, 5), tx("ZX-SRC", "RIVAL-2", "SELL", 99, 5), tx("ZX-SRC", "RIVAL-1", "PURCHASE", 7, 90)]), t);
  // The same transaction listed again on the next read is not double-counted.
  prices.record(market("ZX-SRC", [tx("ZX-SRC", "RIVAL-1", "PURCHASE", 30, 10)]), t);
  prices.record(market("ZX-DST", [tx("ZX-DST", "RIVAL-3", "SELL", 20, 30)]), t);
  const competition = routeCompetition(s => s.startsWith("ME-"), t);
  assert.equal(competition("ZINC", "ZX-SRC", "ZX-DST"), 50);
  assert.equal(competition("ZINC", "ZX-NOWHERE", "ZX-ELSE"), null);
});

test("price change compares the latest reading with the earliest one in the last hour", async () => {
  const { priceChange } = await import("./prices.js");
  const p = (buy: number, sell: number, minsAgo: number) => pt("A", "IRON", buy, sell, "EXPORT", 10, minsAgo);
  // Oldest first; the 90-minute-old point is outside the window.
  const series = [p(50, 40, 90), p(100, 80, 50), p(110, 76, 20), p(120, 72, 1)];
  assert.equal(priceChange(series, "youPay", now), 20);
  assert.equal(priceChange(series, "youGet", now), -10);
  // Less than 10 minutes of history in the window: no trend.
  assert.equal(priceChange([p(100, 80, 5), p(120, 70, 1)], "youPay", now), null);
  const leads = computeTradeLeads([pt("A", "IRON", 50, 40, "EXPORT"), pt("B", "IRON", 120, 100, "IMPORT")], {
    now, change: (wp, _good, side) => (wp === "A" && side === "youPay" ? 15 : wp === "B" && side === "youGet" ? -4 : null),
  });
  assert.deepEqual([leads[0]!.youPayChange1hPct, leads[0]!.youGetChange1hPct], [15, -4]);
});

test("gate finish cost prices missing materials at the cheapest known source", async () => {
  const { finishCost } = await import("./atlas.js");
  const cost = finishCost(
    [{ good: "FAB_MATS", fulfilled: 100, required: 400 }, { good: "ADVANCED_CIRCUITRY", fulfilled: 0, required: 50 }, { good: "QUANTUM_STABILIZERS", fulfilled: 1, required: 1 }],
    good => (good === "FAB_MATS" ? { youPay: 2_000, at: "X1-A-F1" } : null),
  );
  assert.deepEqual(cost, { atLeast: 600_000, unpriced: ["ADVANCED_CIRCUITRY"], sources: ["FAB_MATS 300×2000 @ X1-A-F1"] });
  assert.equal(finishCost([{ good: "FAB_MATS", fulfilled: 5, required: 5 }], () => null), null);
});

test("resale uses the ship's own quote, else a same-frame quote marked estimated", async () => {
  const { resaleFor } = await import("./resale.js");
  const quotes = [
    { ship: "S-1", frame: "FRAME_DRONE", value: 20_000, waypoint: "W", ts: now - 60 * 60_000 },
    { ship: "S-2", frame: "FRAME_DRONE", value: 18_000, waypoint: "W", ts: now - 10 * 60_000 },
  ];
  assert.deepEqual(resaleFor(quotes, "S-1", "FRAME_DRONE", now), { value: 20_000, estimated: false, seenMinutesAgo: 60 });
  assert.deepEqual(resaleFor(quotes, "S-3", "FRAME_DRONE", now), { value: 18_000, estimated: true, seenMinutesAgo: 10 });
  assert.equal(resaleFor(quotes, "S-4", "FRAME_FRIGATE", now), null);
});
