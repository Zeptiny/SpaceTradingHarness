import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduler } from "./scheduler.js";
import { config } from "../config.js";

const gap = config.agent.minWakeGapMs;
const of = (scope: string) => scheduler.pending().filter(w => w.scope === scope);

test("same-scope wakeups within the gap merge into one entry", () => {
  const scope = "all";
  const before = of(scope).length;
  scheduler.schedule(Date.now() + 1_000, "in transit; wake at arrival", scope);
  scheduler.schedule(Date.now() + 1_000 + gap / 2, "in transit; will mine on arrival", scope);
  assert.equal(of(scope).length, before + 1);
  const merged = of(scope).at(-1)!;
  assert.match(merged.reason, /wake at arrival/);
  assert.match(merged.reason, /mine on arrival/);
});

test("merged entry keeps the latest wake time and merges reasons", () => {
  const scope = "ship-latest";
  const t = Date.now();
  scheduler.schedule(t + 1_000, "first-scheduled", scope);
  scheduler.schedule(t + 1_000 + gap / 2, "latest assertion", scope);
  assert.equal(of(scope).length, 1);
  const merged = of(scope)[0]!;
  assert.match(merged.reason, /first-scheduled/);
  assert.match(merged.reason, /latest assertion/);
  assert.ok(merged.at >= t + 1_000 + gap / 2);
});

test("same-scope wakeups further apart than the gap stay separate", () => {
  const scope = "ship-far";
  scheduler.schedule(Date.now() + 1_000, "one", scope);
  scheduler.schedule(Date.now() + 1_000 + gap * 2, "two", scope);
  assert.equal(of(scope).length, 2);
});

test("different scopes within the gap stay separate", () => {
  scheduler.schedule(Date.now() + 1_000, "ship wake", "ship-x");
  scheduler.schedule(Date.now() + 1_000, "global wake", "all");
  assert.equal(of("ship-x").length, 1);
  assert.equal(of("all").length >= 1, true);
});
