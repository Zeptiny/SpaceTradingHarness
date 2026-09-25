import { test } from "node:test";
import assert from "node:assert/strict";
import { planJumps, planRoute, type RoutePoint } from "./route.js";

const p = (symbol: string, x: number, y: number, fuel = false): RoutePoint => ({ symbol, x, y, fuel });

test("direct leg when the tank covers it", () => {
  const legs = planRoute({ from: p("A", 0, 0), to: p("B", 100, 0), stations: [], fuel: 150, capacity: 200, refuelAtStart: true });
  assert.deepEqual(legs, [{ to: "B", mode: "CRUISE", distance: 100, fuel: 100 }]);
});

test("stops at a fuel market when the destination is out of range", () => {
  const legs = planRoute({
    from: p("A", 0, 0), to: p("C", 300, 0),
    stations: [p("F", 150, 0, true), p("G", 0, 500, true)],
    fuel: 200, capacity: 200, refuelAtStart: false,
  });
  assert.deepEqual(legs?.map(l => l.to), ["F", "C"]);
  assert.ok(legs?.every(l => l.mode === "CRUISE"));
});

test("counts a top-up at the start when the origin sells fuel", () => {
  const legs = planRoute({ from: p("A", 0, 0, true), to: p("B", 180, 0), stations: [], fuel: 20, capacity: 200, refuelAtStart: true });
  assert.equal(legs?.[0]?.mode, "CRUISE");
  const noTopUp = planRoute({ from: p("A", 0, 0, true), to: p("B", 180, 0), stations: [], fuel: 20, capacity: 200, refuelAtStart: false });
  assert.equal(noTopUp?.[0]?.mode, "DRIFT");
});

test("falls back to DRIFT when no CRUISE path exists", () => {
  const legs = planRoute({ from: p("A", 0, 0), to: p("B", 500, 0), stations: [], fuel: 50, capacity: 100, refuelAtStart: true });
  assert.deepEqual(legs, [{ to: "B", mode: "DRIFT", distance: 500, fuel: 1 }]);
});

test("probes (no tank) fly direct", () => {
  const legs = planRoute({ from: p("A", 0, 0), to: p("B", 900, 0), stations: [], fuel: 0, capacity: 0, refuelAtStart: true });
  assert.deepEqual(legs?.map(l => l.to), ["B"]);
});

test("jump path through known gates", () => {
  const gates = [
    { symbol: "X1-AA-G1", system: "X1-AA", connections: ["X1-BB-G2"] },
    { symbol: "X1-BB-G2", system: "X1-BB", connections: ["X1-AA-G1", "X1-CC-G3"] },
  ];
  assert.deepEqual(planJumps("X1-AA", "X1-CC", gates), ["X1-AA-G1", "X1-BB-G2", "X1-CC-G3"]);
  assert.equal(planJumps("X1-AA", "X1-DD", gates), null);
});
