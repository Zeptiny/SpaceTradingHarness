import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReset } from "./ratelimit.js";

test("parses an ISO reset header", () => {
  assert.equal(parseReset("2026-09-25T15:10:00.000Z"), Date.parse("2026-09-25T15:10:00.000Z"));
});

test("parses epoch seconds, epoch ms and seconds-from-now", () => {
  assert.equal(parseReset("1790000000"), 1_790_000_000_000);
  assert.equal(parseReset("1790000000000"), 1_790_000_000_000);
  const t = parseReset("5")!;
  assert.ok(Math.abs(t - (Date.now() + 5000)) < 1000);
});

test("ignores missing or garbage values", () => {
  assert.equal(parseReset(null), null);
  assert.equal(parseReset("soon"), null);
});
