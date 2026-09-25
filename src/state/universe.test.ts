import { test } from "node:test";
import assert from "node:assert/strict";
import { universeAction } from "./universe.js";

test("universe check archives data only when the reset date or agent changed", () => {
  const cur = { resetDate: "2026-09-21", agent: "ARTUR" };
  assert.equal(universeAction(null, cur), "adopt");
  assert.equal(universeAction({ ...cur }, cur), "same");
  assert.equal(universeAction({ resetDate: "2026-09-07", agent: "ARTUR" }, cur), "archive");
  assert.equal(universeAction({ resetDate: "2026-09-21", agent: "OTHER" }, cur), "archive");
});
