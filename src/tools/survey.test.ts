import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// create_survey stores the API's survey; extract_with_survey takes only its
// signature and sends the stored object, so deposits stay [{symbol}] objects.

for (const k of ["API_TOKEN", "OPENAI_API_URL", "OPENAI_API_KEY", "LLM_MODEL"]) process.env[k] ??= "test";
process.env.TRANSPORT_MIN_INTERVAL_MS = "0";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "survey-test-"));
await import("./advanced.js");
const { getTool } = await import("./registry.js");
const { surveys } = await import("../state/surveys.js");
import type { FreshReader } from "../guards/index.js";
import type { Ship, Survey } from "../generated/types.js";

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const survey = (signature: string, waypoint: string, expiration = inMinutes(30)): Survey => ({
  signature, symbol: waypoint, expiration, size: "MODERATE",
  deposits: [{ symbol: "QUARTZ_SAND" }, { symbol: "COPPER_ORE" }],
} as Survey);

const ship = (waypointSymbol: string) => ({
  symbol: "KAGALI-5",
  nav: { waypointSymbol, status: "IN_ORBIT" },
  cooldown: { remainingSeconds: 0 },
  mounts: [{ symbol: "MOUNT_MINING_LASER_I" }, { symbol: "MOUNT_SURVEYOR_I" }],
  cargo: { units: 0, capacity: 40, inventory: [] },
} as unknown as Ship);

function ctx(at: string) {
  const fresh: FreshReader = {
    ship: async () => ship(at),
    market: async () => undefined,
    waypoint: async () => undefined,
    shipyard: async () => undefined,
    agent: async () => undefined,
  };
  return { fresh, shipLock: async () => () => {} };
}

async function withFetch<T>(reply: (url: string, body: unknown) => unknown, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const data = reply(String(url), init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

async function guards(tool: string, args: Record<string, unknown>, at: string) {
  for (const g of getTool(tool)!.guards ?? []) {
    const r = await g(tool, { args, fresh: ctx(at).fresh });
    if (!r.ok) return r;
  }
  return { ok: true };
}

test("create_survey keeps the survey and extract_with_survey sends it unchanged", async () => {
  const s = survey("X1-AS58-ZA5Z-0BFE97", "X1-AS58-ZA5Z");
  const created = await withFetch(() => ({ cooldown: { remainingSeconds: 0 }, surveys: [s] }),
    () => getTool("create_survey")!.handler({ shipSymbol: "KAGALI-5" }, ctx("X1-AS58-ZA5Z")));
  assert.deepEqual((created.result as { deposits: string[] }[])[0]!.deposits, ["QUARTZ_SAND", "COPPER_ORE"]);

  const args = { shipSymbol: "KAGALI-5", surveySignature: s.signature };
  assert.equal((await guards("extract_with_survey", args, "X1-AS58-ZA5Z")).ok, true);

  let sent: unknown;
  await withFetch((url, body) => {
    sent = body;
    return {
      extraction: { yield: { symbol: "COPPER_ORE", units: 5 } },
      cargo: { units: 5, capacity: 40, inventory: [] },
      cooldown: { remainingSeconds: 0 },
    };
  }, () => getTool("extract_with_survey")!.handler(args, ctx("X1-AS58-ZA5Z")));
  assert.deepEqual(sent, s);
});

test("extract_with_survey refuses a survey for another waypoint", async () => {
  surveys.add([survey("SIG-ELSEWHERE", "X1-AS58-B7")]);
  const r = await guards("extract_with_survey", { shipSymbol: "KAGALI-5", surveySignature: "SIG-ELSEWHERE" }, "X1-AS58-ZA5Z");
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /is for X1-AS58-B7/);
});

test("expired surveys are dropped and refused", async () => {
  surveys.add([survey("SIG-OLD", "X1-AS58-ZA5Z", inMinutes(-1))]);
  assert.equal(surveys.get("SIG-OLD"), undefined);
  assert.ok(!surveys.active().some(s => s.signature === "SIG-OLD"));
  const r = await guards("extract_with_survey", { shipSymbol: "KAGALI-5", surveySignature: "SIG-OLD" }, "X1-AS58-ZA5Z");
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /expired or unknown/);
});
