import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Checks every request body the client sends against openapi.json, so a
// renamed field (e.g. transfer's receiving ship is `shipSymbol`, not
// `receiveShipSymbol`) fails here instead of as a 422 in the live game.

for (const k of ["API_TOKEN", "OPENAI_API_URL", "OPENAI_API_KEY", "LLM_MODEL"]) process.env[k] ??= "test";
process.env.TRANSPORT_MIN_INTERVAL_MS = "0";
const { api } = await import("./index.js");
const { routes } = await import("../generated/routes.js");

type Schema = { $ref?: string; properties?: Record<string, unknown>; required?: string[] };
const spec = JSON.parse(readFileSync(new URL("../../openapi.json", import.meta.url), "utf8")) as {
  paths: Record<string, Record<string, { operationId?: string; requestBody?: { content: { "application/json": { schema: Schema } } } }>>;
  components: { schemas: Record<string, Schema> };
};

function bodySchema(operationId: string): Schema | undefined {
  for (const methods of Object.values(spec.paths)) {
    for (const op of Object.values(methods)) {
      if (op.operationId !== operationId) continue;
      const s = op.requestBody?.content["application/json"].schema;
      return s?.$ref ? spec.components.schemas[s.$ref.split("/").pop()!] : s;
    }
  }
  throw new Error(`operation ${operationId} not in openapi.json`);
}

const survey = { signature: "X1-A-B1-1", symbol: "X1-A-B1", deposits: [{ symbol: "IRON_ORE" }], expiration: "2030-01-01T00:00:00Z", size: "SMALL" };

// One call per client method that sends a body.
const calls: Record<string, () => Promise<unknown>> = {
  navigateShip: () => api.navigate("S-1", "X1-A-B1"),
  supplyConstruction: () => api.supplyConstruction("X1-A", "X1-A-I1", "S-1", "FAB_MATS", 5),
  patchShipNav: () => api.patchNav("S-1", "DRIFT"),
  warpShip: () => api.warp("S-1", "X1-A-B1"),
  jumpShip: () => api.jump("S-1", "X1-A-B1"),
  extractResourcesWithSurvey: () => api.extractWithSurvey("S-1", survey as never),
  purchaseCargo: () => api.purchaseCargo("S-1", "IRON_ORE", 1),
  sellCargo: () => api.sellCargo("S-1", "IRON_ORE", 1),
  jettison: () => api.jettison("S-1", "IRON_ORE", 1),
  transferCargo: () => api.transferCargo("S-1", "IRON_ORE", 3, "S-2"),
  shipRefine: () => api.shipRefine("S-1", "IRON"),
  purchaseShip: () => api.purchaseShip("SHIP_PROBE", "X1-A-B1"),
  installShipModule: () => api.installModule("S-1", "MODULE_CARGO_HOLD_I"),
  removeShipModule: () => api.removeModule("S-1", "MODULE_CARGO_HOLD_I"),
  installMount: () => api.installMount("S-1", "MOUNT_SURVEYOR_I"),
  removeMount: () => api.removeMount("S-1", "MOUNT_SURVEYOR_I"),
  deliverContract: () => api.deliverContract("C-1", "S-1", "IRON_ORE", 1),
};

async function sentBody(call: () => Promise<unknown>): Promise<Record<string, unknown>> {
  let body = "";
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  }) as typeof fetch;
  try {
    await call();
  } finally {
    globalThis.fetch = real;
  }
  return JSON.parse(body) as Record<string, unknown>;
}

for (const [route, call] of Object.entries(calls)) {
  test(`${route} body matches the API spec`, async () => {
    const schema = bodySchema(routes[route as keyof typeof routes].operationId);
    const sent = await sentBody(call);
    const allowed = Object.keys(schema?.properties ?? {});
    for (const key of Object.keys(sent)) assert.ok(allowed.includes(key), `sends unknown field "${key}" (spec has ${allowed.join(", ")})`);
    for (const key of schema?.required ?? []) assert.ok(key in sent, `missing required field "${key}"`);
  });
}

test("transfer names the receiving ship as shipSymbol in the body", async () => {
  const sent = await sentBody(() => api.transferCargo("S-1", "IRON_ORE", 3, "S-2"));
  assert.deepEqual(sent, { tradeSymbol: "IRON_ORE", units: 3, shipSymbol: "S-2" });
});
