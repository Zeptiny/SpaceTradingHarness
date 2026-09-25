import { test } from "node:test";
import assert from "node:assert/strict";
import { Scheduler, scheduler, type Wakeup } from "./scheduler.js";
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function fresh(): { s: Scheduler; fired: Wakeup[] } {
  const s = new Scheduler();
  const fired: Wakeup[] = [];
  s.onWake(w => fired.push(w));
  return { s, fired };
}

test("repeated merges never stack the same reason twice", () => {
  const { s } = fresh();
  const t = Date.now() + 60_000;
  s.schedule(t, "in transit; wake at arrival", "ship-r");
  s.schedule(t, "extraction cooldown done", "ship-r");
  s.schedule(t, "in transit; wake at arrival", "ship-r");
  s.schedule(t, "extraction cooldown done", "ship-r");
  assert.equal(s.pending().length, 1);
  assert.equal(s.pending()[0]!.reason, "in transit; wake at arrival; extraction cooldown done");
  s.setBusy(true); // disarm so the test process can exit
});

test("wakes due while the loop is busy wait with their reasons, then fire as one wake", async () => {
  const { s, fired } = fresh();
  s.setBusy(true);
  s.schedule(Date.now() + 10, "TEAR-3 arrival at X1-A1", "TEAR-3");
  s.schedule(Date.now() + 20, "TEAR-5 arrival at X1-B2", "TEAR-5");
  await sleep(80);
  assert.equal(fired.length, 0, "nothing fires into a busy loop");
  assert.deepEqual(s.pending().map(w => w.reason), ["TEAR-3 arrival at X1-A1", "TEAR-5 arrival at X1-B2"]);

  s.setBusy(false);
  await sleep(20);
  assert.equal(fired.length, 1, "held wakes go out together");
  assert.match(fired[0]!.reason, /TEAR-3 arrival at X1-A1/);
  assert.match(fired[0]!.reason, /TEAR-5 arrival at X1-B2/);
  assert.doesNotMatch(fired[0]!.reason, /requeue/);
  assert.equal(fired[0]!.scope, "all");
  assert.equal(s.pending().length, 0);
});

test("a firing wake takes every due entry but leaves future ones queued", async () => {
  const { s, fired } = fresh();
  const t = Date.now() + 10;
  s.schedule(t, "TEAR-1 extraction cooldown done", "TEAR-1");
  s.schedule(t, "TEAR-2 arrival", "TEAR-2");
  s.schedule(Date.now() + 5_000, "TEAR-4 arrival", "TEAR-4");
  await sleep(60);
  assert.equal(fired.length, 1);
  assert.match(fired[0]!.reason, /TEAR-1 extraction cooldown done; TEAR-2 arrival/);
  assert.deepEqual(s.pending().map(w => w.scope), ["TEAR-4"]);
  s.setBusy(true); // disarm so the test process can exit
});

test("a single ship's wake keeps its scope", async () => {
  const { s, fired } = fresh();
  s.schedule(Date.now() + 5, "TEAR-1 arrival", "TEAR-1");
  await sleep(40);
  assert.equal(fired.length, 1);
  assert.equal(fired[0]!.scope, "TEAR-1");
});

test("a manual wake during a busy loop runs right after it, merged with due wakes", async () => {
  const { s, fired } = fresh();
  s.setBusy(true);
  s.wakeNow("manual wake");
  s.schedule(Date.now(), "TEAR-3 arrival", "TEAR-3");
  await sleep(30);
  assert.equal(fired.length, 0);
  s.setBusy(false);
  await sleep(20);
  assert.equal(fired.length, 1);
  assert.match(fired[0]!.reason, /manual wake/);
  assert.match(fired[0]!.reason, /TEAR-3 arrival/);
});
