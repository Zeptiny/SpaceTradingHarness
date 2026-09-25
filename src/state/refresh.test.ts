import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

for (const k of ["API_TOKEN", "OPENAI_API_URL", "OPENAI_API_KEY", "LLM_MODEL"]) process.env[k] ??= "test";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "refresh-test-"));
const { transport } = await import("../transport/http.js");
const { refreshFleet, scanShipLocations } = await import("./refresh.js");
const { upsertShip } = await import("./store.js");
const { isUsableShip } = await import("./projections.js");
import type { Ship } from "../generated/types.js";

function ship(symbol: string, status: string, waypointSymbol: string): Ship {
  return {
    symbol,
    nav: { status, waypointSymbol, systemSymbol: "X1-AA", flightMode: "CRUISE" },
    cargo: { capacity: 40, units: 0, inventory: [] },
    fuel: { current: 100, capacity: 400 },
    cooldown: { remainingSeconds: 0 },
  } as unknown as Ship;
}

// Regression: "working memory refresh failed: Cannot read properties of
// undefined (reading 'nav')". The wake-start scan awaits between waypoints;
// a routine that moved the only ship at a waypoint in the meantime used to
// swap that ship inside the very array the scan was reading.
test("a routine moving a ship mid-scan neither crashes the scan nor edits the wake's fleet", async t => {
  const moved = ship("S-2", "IN_TRANSIT", "X1-AA-C3");
  const request = t.mock.method(transport, "request", async (route: string, opts: { path?: Record<string, string> } = {}) => {
    if (route === "getMyShips") return { data: [ship("S-1", "DOCKED", "X1-AA-A1"), ship("S-2", "DOCKED", "X1-AA-B2")], meta: { total: 2 } };
    if (route === "getWaypoint") {
      if (opts.path?.waypointSymbol === "X1-AA-A1") upsertShip(moved); // routine step lands while the scan waits
      return { data: { symbol: opts.path?.waypointSymbol, systemSymbol: opts.path?.systemSymbol, type: "PLANET", x: 0, y: 0, traits: [], orbitals: [] } };
    }
    throw new Error(`unexpected ${route}`);
  });

  const ships = await refreshFleet();
  assert.ok(ships);
  await scanShipLocations(ships, 10);

  const waypointReads = request.mock.calls.filter(c => c.arguments[0] === "getWaypoint").map(c => (c.arguments[1] as { path: { waypointSymbol: string } }).path.waypointSymbol);
  assert.deepEqual(waypointReads, ["X1-AA-A1", "X1-AA-B2"]);
  assert.equal(ships[1]!.nav.status, "DOCKED", "the wake keeps the fleet it read");
});

test("isUsableShip: rejects records missing what working memory reads", () => {
  assert.equal(isUsableShip(ship("S-1", "DOCKED", "X1-AA-A1")), true);
  assert.equal(isUsableShip(undefined), false);
  assert.equal(isUsableShip({ symbol: "S-9", fuel: {}, cargo: {}, cooldown: {} } as unknown as Ship), false);
});
