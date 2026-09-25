import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPage, isStale, toRow, PAGE_SIZE, type GalaxyData } from "./galaxy.js";
import type { System } from "../generated/types.js";

const system = (symbol: string, x = 0, y = 0): System => ({
  symbol,
  sectorSymbol: "X1",
  type: "RED_STAR",
  x,
  y,
  waypoints: [{ symbol: `${symbol}-A1`, type: "PLANET", x: 1, y: 1, orbitals: [] }],
  factions: [{ symbol: "COSMIC" }],
});
const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => system(`X1-S${from + i}`));
const fresh = (): GalaxyData => ({ systems: {}, complete: false, nextPage: 1, total: null, source: null, dumpFailedAt: null, updatedAt: 0 });

test("a system becomes a compact row", () => {
  assert.deepEqual(toRow(system("X1-AB12", -40, 7)), ["X1-AB12", -40, 7, "RED_STAR", 1, "COSMIC"]);
});

test("pages accumulate until the server total is reached", () => {
  let d = applyPage(fresh(), 1, page(0, PAGE_SIZE), 45);
  assert.equal(d.complete, false);
  assert.equal(d.nextPage, 2);
  d = applyPage(d, 2, page(20, PAGE_SIZE), 45);
  assert.equal(d.nextPage, 3);
  d = applyPage(d, 3, page(40, 5), 45);
  assert.equal(d.complete, true);
  assert.equal(Object.keys(d.systems).length, 45);
  assert.equal(d.source, "pages");
});

test("a changed total mid-way restarts from page one", () => {
  const d1 = applyPage(fresh(), 1, page(0, PAGE_SIZE), 45);
  const d2 = applyPage(d1, 2, page(20, PAGE_SIZE), 60);
  assert.equal(d2.nextPage, 1);
  assert.equal(Object.keys(d2.systems).length, 0);
  assert.equal(d2.total, 60);
  assert.equal(d2.complete, false);
});

test("a finished galaxy without the fleet's system is from an earlier reset", () => {
  const d = applyPage(fresh(), 1, page(0, 3), 3);
  assert.equal(isStale(d, ["X1-S1"]), false);
  assert.equal(isStale(d, ["X1-NEW9"]), true);
  // still loading: a missing system may simply not be read yet
  assert.equal(isStale(applyPage(fresh(), 1, page(0, PAGE_SIZE), 45), ["X1-NEW9"]), false);
});
