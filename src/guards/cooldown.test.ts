import { test } from "node:test";
import assert from "node:assert/strict";
import { cooldownClear, type FreshReader } from "./index.js";
import type { Ship } from "../generated/types.js";

function reader(cooldown: Ship["cooldown"]): FreshReader {
  return {
    ship: async () => ({ symbol: "TEAR-1", cooldown } as Ship),
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
});
