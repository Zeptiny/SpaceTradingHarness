import { test } from "node:test";
import assert from "node:assert/strict";
import { planCollection, taskKey, type PlannerView } from "./collector.js";
import { summarizeGates, type AtlasData, type KnownSystem, type KnownWaypoint } from "./atlas.js";

const now = 1_000_000_000;
const MIN = 60_000;

const wp = (symbol: string, type: string, traits: string[] = [], extra: Partial<KnownWaypoint> = {}): KnownWaypoint => ({
  symbol, system: symbol.split("-").slice(0, 2).join("-"), type, x: 0, y: 0, traits, ...extra,
});
const sys = (symbol: string, x: number, y: number, extra: Partial<KnownSystem> = {}): KnownSystem => ({
  symbol, x, y, type: "RED_STAR", waypointTypes: {}, mapped: false, nextPage: 1, scouted: false, ...extra,
});

function view(data: AtlasData, priced: Record<string, number> = {}, yards: Record<string, number> = {}): PlannerView {
  return {
    system: s => data.systems[s],
    inSystem: s => Object.values(data.waypoints).filter(w => w.system === s),
    gate: w => data.gates[w],
    construction: w => data.construction[w],
    market: w => data.markets[w],
    pricedAt: w => priced[w],
    shipyardSeenAt: w => yards[w],
  };
}

const empty = (): AtlasData => ({ waypoints: {}, systems: {}, gates: {}, construction: {}, markets: {} });

test("an unknown home system is looked up and mapped first", () => {
  const tasks = planCollection(view(empty()), [{ system: "X1-A", waypoint: "X1-A-B1", inTransit: false }], now);
  assert.deepEqual(tasks.map(taskKey), ["system:X1-A", "map:X1-A"]);
});

test("mapped home: stale parked-ship prices, then gate, construction, market lists, neighbors", () => {
  const d = empty();
  d.systems["X1-A"] = sys("X1-A", 0, 0, { mapped: true });
  d.waypoints["X1-A-M1"] = wp("X1-A-M1", "PLANET", ["MARKETPLACE"]);
  d.waypoints["X1-A-M2"] = wp("X1-A-M2", "MOON", ["MARKETPLACE"]);
  d.waypoints["X1-A-M3"] = wp("X1-A-M3", "MOON", ["MARKETPLACE", "SHIPYARD"]);
  d.waypoints["X1-A-G"] = wp("X1-A-G", "JUMP_GATE", [], { underConstruction: true });
  d.markets["X1-A-M1"] = { exports: [], imports: [], exchange: [] };
  d.markets["X1-A-M3"] = { exports: [], imports: [], exchange: [] };
  const ships = [
    { system: "X1-A", waypoint: "X1-A-M1", inTransit: false }, // priced 10 min ago → refresh
    { system: "X1-A", waypoint: "X1-A-M3", inTransit: false }, // priced 1 min ago, shipyard never seen
    { system: "X1-A", waypoint: "X1-A-M2", inTransit: true }, // in transit: not a price probe
  ];
  const tasks = planCollection(view(d, { "X1-A-M1": now - 10 * MIN, "X1-A-M3": now - MIN }), ships, now);
  assert.deepEqual(tasks.map(taskKey), [
    "prices:X1-A-M1",
    "shipyard:X1-A-M3",
    "gate:X1-A-G",
    "construction:X1-A-G",
    "market-list:X1-A-M2",
  ]);

  d.gates["X1-A-G"] = { symbol: "X1-A-G", system: "X1-A", connections: ["X1-B-G", "X1-C-G"] };
  d.construction["X1-A-G"] = { materials: [], isComplete: false, fetchedAt: now - MIN };
  d.systems["X1-C"] = sys("X1-C", 10, 0, { scouted: true });
  const later = planCollection(view(d, { "X1-A-M1": now, "X1-A-M3": now }, { "X1-A-M3": now }), ships, now);
  assert.deepEqual(later.map(taskKey), ["market-list:X1-A-M2", "system:X1-B", "scout:X1-B"]);
});

test("gate summary: construction progress and scouted neighbors nearest first", () => {
  const d = empty();
  d.systems["X1-A"] = sys("X1-A", 0, 0, { mapped: true });
  d.systems["X1-B"] = sys("X1-B", 300, 400, { scouted: true, waypointTypes: { ENGINEERED_ASTEROID: 1, ASTEROID: 3, PLANET: 2 } });
  d.systems["X1-C"] = sys("X1-C", 30, 40);
  d.waypoints["X1-A-G"] = wp("X1-A-G", "JUMP_GATE", [], { underConstruction: true });
  d.waypoints["X1-B-S1"] = wp("X1-B-S1", "PLANET", ["SHIPYARD", "MARKETPLACE"]);
  d.waypoints["X1-B-M1"] = wp("X1-B-M1", "MOON", ["MARKETPLACE"]);
  d.gates["X1-A-G"] = { symbol: "X1-A-G", system: "X1-A", connections: ["X1-B-G", "X1-C-G", "X1-D-G"] };
  d.construction["X1-A-G"] = { materials: [{ good: "FAB_MATS", fulfilled: 100, required: 1600 }], isComplete: false, fetchedAt: now };

  const [g] = summarizeGates(d, ["X1-A"]);
  assert.ok(g);
  assert.equal(g.underConstruction, true);
  assert.equal(g.construction, "FAB_MATS 100/1600");
  assert.deepEqual(g.connections, [
    { system: "X1-C", gate: "X1-C-G", distance: 50, shipyards: null, marketplaces: null, asteroids: 0 },
    { system: "X1-B", gate: "X1-B-G", distance: 500, shipyards: ["X1-B-S1"], marketplaces: 2, asteroids: 4 },
    { system: "X1-D", gate: "X1-D-G", distance: null, shipyards: null, marketplaces: null, asteroids: null },
  ]);
});

test("gate summary is empty for a system without a known gate", () => {
  assert.deepEqual(summarizeGates(empty(), ["X1-A"]), []);
});

test("atlas keeps waypoint modifiers from listings and extractions", async () => {
  const { atlas } = await import("./atlas.js");
  const wp = (modifiers?: { symbol: string }[], traits = [{ symbol: "COMMON_METAL_DEPOSITS" }]) =>
    ({ symbol: "ZM-SYS-AST1", systemSymbol: "ZM-SYS", type: "ENGINEERED_ASTEROID", x: 1, y: 2, traits, modifiers, orbitals: [] }) as unknown as import("../generated/types.js").Waypoint;
  atlas.record([wp([{ symbol: "STRIPPED" }])]);
  assert.deepEqual(atlas.get("ZM-SYS-AST1")?.modifiers, ["STRIPPED"]);
  assert.deepEqual(atlas.summary(["ZM-SYS"])[0]?.waypoints[0]?.modifiers, ["STRIPPED"]);
  // A trait-less record (scanned from afar) leaves known modifiers alone.
  atlas.record([wp(undefined, [])]);
  assert.deepEqual(atlas.get("ZM-SYS-AST1")?.modifiers, ["STRIPPED"]);
  assert.equal(atlas.depleted("ZM-SYS-AST1"), true);
  // An old sighting stops counting, so miners go back and look again.
  assert.equal(atlas.depleted("ZM-SYS-AST1", Date.now() + 3 * 3600_000), false);
  atlas.recordModifiers("ZM-SYS-AST1", []);
  assert.equal(atlas.get("ZM-SYS-AST1")?.modifiers, undefined);
  assert.equal(atlas.depleted("ZM-SYS-AST1"), false);
});

test("a ship docked at a shipyard gets a scrap quote when its last one is stale", () => {
  const d = empty();
  d.systems["X1-A"] = sys("X1-A", 0, 0, { mapped: true });
  d.waypoints["X1-A-Y1"] = wp("X1-A-Y1", "PLANET", ["SHIPYARD"]);
  const v = { ...view(d, {}, { "X1-A-Y1": now }), resaleSeenAt: (s: string) => (s === "S-2" ? now - MIN : undefined) };
  const tasks = planCollection(v, [
    { system: "X1-A", waypoint: "X1-A-Y1", inTransit: false, ship: "S-1", docked: true },
    { system: "X1-A", waypoint: "X1-A-Y1", inTransit: false, ship: "S-2", docked: true }, // quoted a minute ago
    { system: "X1-A", waypoint: "X1-A-Y1", inTransit: false, ship: "S-3", docked: false }, // in orbit: the API needs it docked
  ], now);
  assert.deepEqual(tasks.map(taskKey), ["resale:S-1"]);
});
