import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetTable } from "./projections.js";
import type { Ship } from "../generated/types.js";

const NOW = Date.parse("2026-09-25T12:00:00Z");

function ship(symbol: string, nav: Partial<Ship["nav"]>, extra: Partial<Ship> = {}): Ship {
  return {
    symbol,
    frame: { symbol: "FRAME_FRIGATE" },
    nav: { status: "DOCKED", waypointSymbol: "X1-AA-A1", systemSymbol: "X1-AA", route: { origin: { symbol: "X1-AA-A1" }, destination: { symbol: "X1-AA-A1" }, arrival: "" }, ...nav },
    cargo: { capacity: 40, units: 3, inventory: [{ symbol: "IRON", units: 3 }] },
    fuel: { current: 100, capacity: 400 },
    cooldown: { remainingSeconds: 0 },
    ...extra,
  } as unknown as Ship;
}

test("fleet table: one line per ship with location, cargo, fuel and readiness", () => {
  const lines = fleetTable(
    [
      ship("S-1", {}),
      ship("S-2", { status: "IN_TRANSIT", route: { origin: { symbol: "X1-AA-A1" }, destination: { symbol: "X1-AA-B2" }, arrival: "2026-09-25T12:01:00Z" } } as Partial<Ship["nav"]>),
      ship("S-3", { status: "IN_ORBIT" }, { cooldown: { expiration: "2026-09-25T12:00:30Z" } } as Partial<Ship>),
    ],
    s => (s === "S-1" ? { description: "trade IRON A1 → B2", phase: "buying" } : undefined),
    NOW,
  ).split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "S-1 FRIGATE | DOCKED @ X1-AA-A1 | cargo 3/40 IRON:3 | fuel 100/400 | ready | routine: trade IRON A1 → B2 (buying)");
  assert.match(lines[1]!, /IN_TRANSIT X1-AA-A1 → X1-AA-B2, arrives in 60s/);
  assert.match(lines[2]!, /cooldown 30s/);
});
