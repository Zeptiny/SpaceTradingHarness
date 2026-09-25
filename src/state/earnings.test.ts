import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeEarnings } from "./earnings.js";

const H = 3600_000;

test("per-ship totals, hourly rate and payback", () => {
  const now = 10 * H;
  const rows = summarizeEarnings(
    [
      { ts: 2 * H, ship: "A-1", amount: -1000, kind: "trade" },
      { ts: 3 * H, ship: "A-1", amount: 5000, kind: "trade" },
      { ts: 9.5 * H, ship: "A-1", amount: -200, kind: "fuel" },
      { ts: 9.8 * H, ship: "A-2", amount: 300, kind: "trade" },
    ],
    { "A-1": { boughtFor: 38_000, since: 2 * H }, "A-2": { since: 9.9 * H } },
    ["A-1", "A-2", "A-3"],
    now,
  );
  const a1 = rows.find(r => r.ship === "A-1")!;
  assert.equal(a1.total, 3800);
  assert.equal(a1.lastHour, -200);
  assert.equal(a1.trackedHours, 8);
  assert.equal(a1.perHour, 475);
  assert.equal(a1.paybackHours, 80);
  assert.deepEqual(a1.byKind, { trade: 4000, fuel: -200 });
  const a2 = rows.find(r => r.ship === "A-2")!;
  assert.equal(a2.perHour, null); // under 15 minutes tracked
  const a3 = rows.find(r => r.ship === "A-3")!;
  assert.equal(a3.total, 0);
});
