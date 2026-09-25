import { test } from "node:test";
import assert from "node:assert/strict";
import { ShipLocks } from "./shipLocks.js";

const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms));

test("a call that times out waiting does not wedge the ship", async () => {
  const locks = new ShipLocks();
  const releaseSlow = await locks.acquire("S-1", 1_000, "routine navigate");

  // Queued behind the slow step, gives up before it finishes.
  await assert.rejects(locks.acquire("S-1", 20, "cancel_routine"), /ship lock timeout for S-1 after 0s \(still busy with routine navigate\)/);

  releaseSlow();
  // The abandoned slot must open by itself so the next call gets the lock.
  const release = await locks.acquire("S-1", 200, "navigate");
  release();
  await tick();
  assert.equal(locks.busy("S-1"), false);
});

test("calls on one ship run in order; other ships are independent", async () => {
  const locks = new ShipLocks();
  const order: string[] = [];
  const r1 = await locks.acquire("A", 1_000);
  const second = locks.acquire("A", 1_000).then(r => { order.push("A2"); r(); });
  const other = locks.acquire("B", 1_000).then(r => { order.push("B1"); r(); });
  await other;
  order.push("A1");
  r1();
  await second;
  assert.deepEqual(order, ["B1", "A1", "A2"]);
});

test("releasing twice is harmless", async () => {
  const locks = new ShipLocks();
  const r1 = await locks.acquire("A", 1_000);
  r1();
  r1();
  const r2 = await locks.acquire("A", 100);
  r2();
});
