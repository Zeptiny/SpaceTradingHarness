import { test } from "node:test";
import assert from "node:assert/strict";
import { cooldownClear, notInTransit, type FreshReader } from "./index.js";
import type { Ship } from "../generated/types.js";

function reader(cooldown: Ship["cooldown"], nav?: Partial<Ship["nav"]>): FreshReader {
  return {
    ship: async () => ({ symbol: "TEAR-1", cooldown, nav: { status: "IN_ORBIT", ...nav } } as Ship),
    market: async () => undefined,
    waypoint: async () => undefined,
    shipyard: async () => undefined,
    agent: async () => undefined,
  };
}

const args = { shipSymbol: "TEAR-1" };

test("passes when the server reports no cooldown left", async () => {
  const r = await cooldownClear("extract", { args, fresh: reader({ shipSymbol: "TEAR-1", totalSeconds: 70, remainingSeconds: 0 }) });
  assert.equal(r.ok, true);
});

test("rejects with seconds left, expiry and the shared-cooldown hint", async () => {
  const expiration = "2026-09-25T14:20:00.000Z";
  const r = await cooldownClear("extract_with_survey", {
    args,
    fresh: reader({ shipSymbol: "TEAR-1", totalSeconds: 70, remainingSeconds: 42, expiration }),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /42s more/);
  assert.ok(r.reason?.includes(expiration));
  assert.match(r.reason ?? "", /survey\/extract/);
  assert.match(r.reason ?? "", /wait_for_ship/);
});

test("transit rejection names the arrival and seconds left", async () => {
  const arrival = new Date(Date.now() + 90_000).toISOString();
  const nav = { status: "IN_TRANSIT" as const, route: { arrival, destination: { symbol: "X1-SZ48-H59" } } as Ship["nav"]["route"] };
  const r = await notInTransit("sell_cargo", {
    args,
    fresh: reader({ shipSymbol: "TEAR-1", totalSeconds: 0, remainingSeconds: 0 }, nav),
  });
  assert.equal(r.ok, false);
  assert.ok(r.reason?.includes(arrival));
  assert.match(r.reason ?? "", /X1-SZ48-H59/);
  assert.match(r.reason ?? "", /(89|90)s from now/);
});
