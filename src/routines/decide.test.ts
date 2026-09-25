import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideGoto, decideMine, decideScout, decideTrade, pickScoutTarget, transitWait,
  type MapView, type Quote, type ShipView, type World,
} from "./decide.js";
import type { RoutePoint } from "../utils/route.js";

const NOW = 1_000_000_000;

const points: Record<string, RoutePoint> = {
  "X1-AA-A1": { symbol: "X1-AA-A1", x: 0, y: 0, fuel: true },
  "X1-AA-B2": { symbol: "X1-AA-B2", x: 100, y: 0, fuel: true },
  "X1-AA-C3": { symbol: "X1-AA-C3", x: 0, y: 50, fuel: false },
  "X1-AA-G1": { symbol: "X1-AA-G1", x: 10, y: 10, fuel: false },
};

function map(autoRefuel = true): MapView {
  return {
    point: s => points[s] ?? null,
    stations: () => Object.values(points).filter(p => p.fuel),
    gates: () => [
      { symbol: "X1-AA-G1", system: "X1-AA", connections: ["X1-BB-G2"] },
      { symbol: "X1-BB-G2", system: "X1-BB", connections: ["X1-AA-G1"] },
    ],
    autoRefuel,
  };
}

function ship(over: Partial<ShipView> = {}): ShipView {
  return {
    symbol: "S-1", system: "X1-AA", waypoint: "X1-AA-A1", status: "DOCKED", arrivalAt: null, cooldownMs: 0,
    cargo: { capacity: 40, units: 0, inventory: [] }, fuel: { current: 400, capacity: 400 },
    ...over,
  };
}

function world(quotes: Record<string, Quote>, over: Partial<World> = {}): World {
  return {
    now: NOW, credits: 100_000, minCredits: 5_000,
    quote: (wp, good) => quotes[`${wp}/${good}`] ?? null,
    contractNeeds: [], markets: () => [], claimed: [], map: map(),
    ...over,
  };
}

const q = (type: string, youPay: number | null, youGet: number | null, ts = NOW): Quote => ({ type, youPay, youGet, tradeVolume: 20, ts });
const trade = { kind: "trade" as const, good: "IRON", buyAt: "X1-AA-A1", sellAt: "X1-AA-B2" };

test("transit: waits for arrival plus slack", () => {
  const s = transitWait(ship({ status: "IN_TRANSIT", arrivalAt: NOW + 10_000 }), NOW);
  assert.equal(s?.do, "wait");
  assert.ok(s && s.do === "wait" && s.ms >= 10_000);
});

test("trade: buys a tradeVolume lot when the margin holds", () => {
  const step = decideTrade(trade, ship(), world({ "X1-AA-A1/IRON": q("EXPORT", 100, 90), "X1-AA-B2/IRON": q("IMPORT", 200, 180) }));
  assert.deepEqual([step.do, (step as { units?: number }).units], ["buy", 20]);
});

test("trade: re-reads a stale buy price first", () => {
  const step = decideTrade(trade, ship(), world({ "X1-AA-A1/IRON": q("EXPORT", 100, 90, NOW - 120_000), "X1-AA-B2/IRON": q("IMPORT", 200, 180) }));
  assert.equal(step.do, "read_market");
});

test("trade: stops when the margin falls under the floor", () => {
  const step = decideTrade(trade, ship(), world({ "X1-AA-A1/IRON": q("EXPORT", 100, 90), "X1-AA-B2/IRON": q("IMPORT", 130, 115) }));
  assert.equal(step.do, "stop");
});

test("trade: keeps the credit floor", () => {
  const w = world({ "X1-AA-A1/IRON": q("EXPORT", 100, 90), "X1-AA-B2/IRON": q("IMPORT", 200, 180) }, { credits: 5_500 });
  const step = decideTrade(trade, ship(), w);
  assert.deepEqual([step.do, (step as { units?: number }).units], ["buy", 5]);
});

test("trade: with cargo, flies to the sell market and sells there", () => {
  const loaded = { capacity: 40, units: 40, inventory: [{ symbol: "IRON", units: 40 }] };
  const quotes = { "X1-AA-A1/IRON": q("EXPORT", 100, 90), "X1-AA-B2/IRON": q("IMPORT", 200, 180) };
  const fly = decideTrade(trade, ship({ cargo: loaded }), world(quotes));
  assert.deepEqual([fly.do, (fly as { to?: string }).to], ["navigate", "X1-AA-B2"]);
  const sell = decideTrade(trade, ship({ cargo: loaded, waypoint: "X1-AA-B2" }), world(quotes));
  assert.equal(sell.do, "sell_all");
});

test("mine: jettisons goods not on the keep list, extracts, then sells when full", () => {
  const spec = { kind: "mine" as const, asteroid: "X1-AA-C3", sellAt: "X1-AA-B2", keep: ["IRON_ORE"] };
  const at = { waypoint: "X1-AA-C3", status: "IN_ORBIT" as const };
  const junk = decideMine(spec, ship({ ...at, cargo: { capacity: 40, units: 5, inventory: [{ symbol: "ICE_WATER", units: 5 }] } }), world({}));
  assert.equal(junk.do, "jettison");
  const dig = decideMine(spec, ship({ ...at, cargo: { capacity: 40, units: 5, inventory: [{ symbol: "IRON_ORE", units: 5 }] } }), world({}));
  assert.equal(dig.do, "extract");
  const cool = decideMine(spec, ship({ ...at, cooldownMs: 30_000 }), world({}));
  assert.equal(cool.do, "wait");
  const full = { capacity: 40, units: 40, inventory: [{ symbol: "IRON_ORE", units: 40 }] };
  const go = decideMine(spec, ship({ ...at, cargo: full }), world({}));
  assert.deepEqual([go.do, (go as { to?: string }).to], ["navigate", "X1-AA-B2"]);
  const sell = decideMine(spec, ship({ waypoint: "X1-AA-B2", cargo: full }), world({ "X1-AA-B2/IRON_ORE": q("IMPORT", 60, 50) }));
  assert.equal(sell.do, "sell_all");
});

test("mine: delivers contract goods before selling", () => {
  const spec = { kind: "mine" as const, asteroid: "X1-AA-C3", sellAt: "X1-AA-B2", deliverContract: true };
  const full = { capacity: 40, units: 40, inventory: [{ symbol: "COPPER_ORE", units: 40 }] };
  const need = [{ contractId: "c1", good: "COPPER_ORE", destination: "X1-AA-A1", remaining: 30 }];
  const step = decideMine(spec, ship({ cargo: full }), world({}, { contractNeeds: need }));
  assert.deepEqual(step, { do: "deliver", contractId: "c1", good: "COPPER_ORE", units: 30, phase: "delivering COPPER_ORE" });
});

test("scout: picks never-priced markets first and skips claimed ones", () => {
  const cands = [
    { symbol: "X1-AA-B2", pricedAt: NOW - 3_600_000 },
    { symbol: "X1-AA-C3", pricedAt: null },
    { symbol: "X1-AA-G1", pricedAt: null },
  ];
  assert.equal(pickScoutTarget(ship(), cands, ["X1-AA-C3"], NOW), "X1-AA-G1");
  assert.equal(pickScoutTarget(ship(), cands.slice(0, 1).map(c => ({ ...c, pricedAt: NOW - 60_000 })), [], NOW), null);
  const step = decideScout({ kind: "scout" }, ship(), world({}, { markets: () => cands }), undefined);
  assert.equal(step.target, "X1-AA-C3");
});

test("goto: crosses a gate (orbit, then jump) and is done on arrival", () => {
  const spec = { kind: "goto" as const, destination: "X1-BB-Z9" };
  const toGate = decideGoto(spec, ship(), world({}));
  assert.deepEqual([toGate.do, (toGate as { to?: string }).to], ["navigate", "X1-AA-G1"]);
  const orbit = decideGoto(spec, ship({ waypoint: "X1-AA-G1" }), world({}));
  assert.equal(orbit.do, "orbit");
  const jump = decideGoto(spec, ship({ waypoint: "X1-AA-G1", status: "IN_ORBIT" }), world({}));
  assert.deepEqual([jump.do, (jump as { to?: string }).to], ["jump", "X1-BB-G2"]);
  const done = decideGoto({ kind: "goto", destination: "X1-AA-A1" }, ship(), world({}));
  assert.equal(done.do, "done");
});

test("goto: refuels first when auto-refuel is off", () => {
  const step = decideGoto({ kind: "goto", destination: "X1-AA-B2" }, ship({ fuel: { current: 50, capacity: 400 } }), world({}, { map: map(false) }));
  assert.equal(step.do, "refuel");
});

test("mine: leaves an over-mined asteroid for the nearest clear one with the same deposits", async () => {
  const { mineSite } = await import("./decide.js");
  const spec = { kind: "mine" as const, asteroid: "X1-AA-C3", sellAt: "X1-AA-B2" };
  const asteroids = (depletedHome: boolean) => () => [
    { symbol: "X1-AA-C3", deposits: ["COMMON_METAL_DEPOSITS"], depleted: depletedHome },
    { symbol: "X1-AA-B2", deposits: ["COMMON_METAL_DEPOSITS"], depleted: false },
    { symbol: "X1-AA-A1", deposits: ["PRECIOUS_METAL_DEPOSITS"], depleted: false }, // nearer, but other deposits
  ];
  assert.deepEqual(mineSite("X1-AA-C3", world({}, { asteroids: asteroids(false) })), { site: "X1-AA-C3" });
  assert.deepEqual(mineSite("X1-AA-C3", world({}, { asteroids: asteroids(true) })), { site: "X1-AA-B2", movedFrom: "X1-AA-C3" });
  const step = decideMine(spec, ship({ waypoint: "X1-AA-C3", status: "IN_ORBIT" }), world({}, { asteroids: asteroids(true) }));
  assert.equal(step.do, "navigate");
  assert.match((step as { phase: string }).phase, /moved off over-mined X1-AA-C3/);
  const stuck = decideMine(spec, ship({ waypoint: "X1-AA-C3" }), world({}, {
    asteroids: () => [{ symbol: "X1-AA-C3", deposits: ["COMMON_METAL_DEPOSITS"], depleted: true }],
  }));
  assert.equal(stuck.do, "stop");
});

test("scout: charts an uncharted waypoint it stands on and visits uncharted ones like unpriced markets", () => {
  const spec = { kind: "scout" as const };
  const w = world({}, { markets: () => [{ symbol: "X1-AA-B2", pricedAt: NOW }], uncharted: () => ["X1-AA-C3"] });
  assert.equal(decideScout(spec, ship({ waypoint: "X1-AA-C3", status: "IN_ORBIT" }), w, undefined).do, "chart");
  const go = decideScout(spec, ship(), w, undefined);
  assert.deepEqual([go.do, go.target], ["navigate", "X1-AA-C3"]);
});
