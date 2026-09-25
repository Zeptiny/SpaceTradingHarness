import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateTimes, isoSec, relTime, stamp } from "./time.js";

const NOW = Date.parse("2026-09-25T15:00:00Z");

test("relTime reads both directions at every scale", () => {
  assert.equal(relTime(NOW, NOW), "now");
  assert.equal(relTime(NOW + 42_000, NOW), "in 42s");
  assert.equal(relTime(NOW - 185_000, NOW), "3m 05s ago");
  assert.equal(relTime(NOW + 7_800_000, NOW), "in 2h 10m");
  assert.equal(relTime(NOW - 97_200_000, NOW), "1d 3h ago");
});

test("stamp is UTC to the second with a relative value", () => {
  assert.equal(isoSec(NOW + 400), "2026-09-25T15:00:00Z");
  assert.equal(stamp("2026-09-25T15:00:42.123Z", NOW), "2026-09-25T15:00:42Z (in 42s)");
  assert.equal(stamp(undefined, NOW), "unknown");
});

test("annotateTimes adds <field>Rel siblings without touching raw values", () => {
  const survey = { signature: "S", expiration: "2026-09-25T15:10:00.000Z", deposits: [{ symbol: "IRON_ORE" }] };
  const out = annotateTimes({ surveys: [survey], note: "arrives 2026-09-25T15:10:00Z" }, NOW);
  assert.equal(out.surveys[0]!.expiration, survey.expiration);
  assert.equal((out.surveys[0] as Record<string, unknown>)["expirationRel"], "in 10m 00s");
  assert.equal(out.note, "arrives 2026-09-25T15:10:00Z");
  assert.equal(Object.keys(survey).length, 3, "input not mutated");
});

test("annotateTimes trims non-survey timestamps to the second", () => {
  const out = annotateTimes({ route: { arrival: "2026-09-25T15:00:42.123Z" } }, NOW);
  assert.deepEqual(out.route, { arrival: "2026-09-25T15:00:42Z", arrivalRel: "in 42s" });
});

test("annotateTimes recomputes a frozen cooldown countdown", () => {
  const out = annotateTimes({ remainingSeconds: 70, expiration: "2026-09-25T15:00:30Z" }, NOW);
  assert.equal(out.remainingSeconds, 30);
});
