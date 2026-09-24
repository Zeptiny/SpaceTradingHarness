// Panel demo: seeds realistic fixture state and simulates agent wakes through
// the real scheduler, event bus and panel — no SpaceTraders API, no LLM.
// Use it to work on the panel without a token or burning rate limit:
//   npm run demo   →   http://127.0.0.1:8790
import { rmSync } from "node:fs";
import path from "node:path";

// Env must be settled before config.ts is evaluated, so every harness module
// is imported dynamically below. The base URL points nowhere: nothing in the
// demo sends requests, and if something did it would fail rather than reach
// the real game with a real token.
const dataDir = path.resolve(process.env.DATA_DIR ?? "data/demo");
Object.assign(process.env, {
  API_TOKEN: "demo",
  ST_BASE_URL: "http://127.0.0.1:9/demo-no-network",
  OPENAI_API_URL: "http://127.0.0.1:9/demo-no-network",
  OPENAI_API_KEY: "demo",
  LLM_MODEL: process.env.LLM_MODEL ?? "demo-model",
  DATA_DIR: dataDir,
  PANEL_PORT: process.env.PANEL_PORT ?? "8790",
});
if (path.basename(dataDir) !== "demo") {
  console.error(`[demo] refusing to wipe DATA_DIR=${dataDir} — its last path segment must be "demo"`);
  process.exit(1);
}
rmSync(dataDir, { recursive: true, force: true });

const { bus } = await import("./events/bus.js");
const { activity } = await import("./state/activity.js");
const { summaries } = await import("./state/summaries.js");
const { memory } = await import("./state/memory.js");
const { prices } = await import("./state/prices.js");
const { creditHistory } = await import("./state/credits.js");
const { checkpointStore } = await import("./state/checkpoint.js");
const { runtime } = await import("./state/runtime.js");
const { mirror, storeKeys, mergeSystemWaypoints, observeAgent, upsertShip } = await import("./state/store.js");
const { scheduler } = await import("./agent/scheduler.js");
const { startPanel } = await import("./panel/server.js");
await import("./tools/read.js");
await import("./tools/actions.js");
await import("./tools/internal.js");
await import("./tools/advanced.js");
type TradeSymbol = import("./generated/types.js").TradeSymbol;
type SupplyLevel = import("./generated/types.js").SupplyLevel;
type ActivityLevel = import("./generated/types.js").ActivityLevel;
type Ship = import("./generated/types.js").Ship;
type Waypoint = import("./generated/types.js").Waypoint;
type Market = import("./generated/types.js").Market;
type Contract = import("./generated/types.js").Contract;
type Agent = import("./generated/types.js").Agent;
type ToolOutcome = import("./events/bus.js").ToolOutcome;

const SYS = "X1-KD26";
const AGENT = "NYUU";
const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.now();
const iso = (t: number) => new Date(t).toISOString();
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- universe

type WpSpec = [suffix: string, type: string, x: number, y: number, traits: string[], orbits?: string];
const wpSpecs: WpSpec[] = [
  ["A1", "PLANET", -8, 14, ["MARKETPLACE", "SHIPYARD", "TEMPERATE", "ROCKY"]],
  ["A2", "MOON", -8, 14, ["MARKETPLACE", "BARREN"], "A1"],
  ["A3", "ORBITAL_STATION", -8, 14, ["MARKETPLACE", "SHIPYARD"], "A1"],
  ["B7", "GAS_GIANT", 42, -30, ["VIBRANT_AURORAS", "STRONG_MAGNETOSPHERE"]],
  ["B8", "MOON", 42, -30, ["MARKETPLACE"], "B7"],
  ["C39", "PLANET", -61, -44, ["MARKETPLACE", "FROZEN"]],
  ["D40", "ORBITAL_STATION", 70, 38, ["MARKETPLACE", "SHIPYARD"]],
  ["E43", "FUEL_STATION", 18, 62, ["MARKETPLACE"]],
  ["F45", "ENGINEERED_ASTEROID", 11, -9, ["COMMON_METAL_DEPOSITS", "MARKETPLACE"]],
  ["G49", "ASTEROID", -30, 58, ["PRECIOUS_METAL_DEPOSITS"]],
  ["G50", "ASTEROID", -34, 66, ["MINERAL_DEPOSITS"]],
  ["G51", "ASTEROID", -24, 70, ["COMMON_METAL_DEPOSITS"]],
  ["G52", "ASTEROID", -40, 52, ["COMMON_METAL_DEPOSITS", "UNSTABLE_COMPOSITION"]],
  ["H51", "PLANET", 88, -12, ["MARKETPLACE", "INDUSTRIAL"]],
  ["H52", "MOON", 88, -12, [], "H51"],
  ["I53", "JUMP_GATE", -92, 20, []],
  ["J60", "ASTEROID_BASE", 55, 80, ["MARKETPLACE", "PIRATE_BASE"]],
  ["K82", "PLANET", -70, -90, ["OCEAN"]],
  ["K83", "MOON", -70, -90, ["MARKETPLACE"], "K82"],
];
const wp = (s: string) => `${SYS}-${s}`;
const waypoints: Waypoint[] = wpSpecs.map(([suffix, type, x, y, traits, orbits]) => ({
  symbol: wp(suffix),
  type: type as Waypoint["type"],
  systemSymbol: SYS,
  x,
  y,
  orbitals: wpSpecs.filter(o => o[5] === suffix).map(o => ({ symbol: wp(o[0]) })),
  ...(orbits ? { orbits: wp(orbits) } : {}),
  traits: traits.map(t => ({ symbol: t as Waypoint["traits"][number]["symbol"], name: t, description: "" })),
  isUnderConstruction: suffix === "I53",
}));
mergeSystemWaypoints(SYS, waypoints);
const coords = new Map(waypoints.map(w => [w.symbol, w]));

// ---------------------------------------------------------------- markets

type G = [good: string, kind: "EXPORT" | "IMPORT" | "EXCHANGE", buy: number, sell: number, supply: string, activity: string];
const marketSpecs: Record<string, G[]> = {
  A1: [["FUEL", "EXCHANGE", 72, 68, "HIGH", "STRONG"], ["FOOD", "EXPORT", 410, 380, "ABUNDANT", "GROWING"], ["IRON", "IMPORT", 212, 198, "SCARCE", "STRONG"], ["ELECTRONICS", "IMPORT", 1840, 1702, "LIMITED", "WEAK"], ["MACHINERY", "IMPORT", 1320, 1244, "MODERATE", "GROWING"]],
  A3: [["FUEL", "EXCHANGE", 70, 66, "ABUNDANT", "STRONG"], ["SHIP_PARTS", "EXPORT", 2610, 2480, "MODERATE", "WEAK"], ["IRON_ORE", "IMPORT", 58, 52, "LIMITED", "GROWING"], ["COPPER_ORE", "IMPORT", 71, 64, "SCARCE", "GROWING"]],
  B8: [["FUEL", "EXCHANGE", 78, 73, "MODERATE", "WEAK"], ["LIQUID_HYDROGEN", "EXPORT", 38, 33, "HIGH", "STRONG"], ["LIQUID_NITROGEN", "EXPORT", 41, 36, "HIGH", "STRONG"], ["PLASTICS", "IMPORT", 220, 205, "LIMITED", "WEAK"]],
  D40: [["FUEL", "EXCHANGE", 74, 69, "HIGH", "STRONG"], ["ELECTRONICS", "EXPORT", 1290, 1188, "HIGH", "GROWING"], ["MACHINERY", "EXPORT", 905, 842, "MODERATE", "STRONG"], ["COPPER", "IMPORT", 190, 176, "SCARCE", "STRONG"], ["ALUMINUM", "IMPORT", 170, 158, "LIMITED", "GROWING"]],
  E43: [["FUEL", "EXPORT", 64, 59, "ABUNDANT", "STRONG"]],
  F45: [["FUEL", "EXCHANGE", 80, 75, "MODERATE", "WEAK"], ["IRON_ORE", "EXPORT", 34, 29, "ABUNDANT", "STRONG"], ["COPPER_ORE", "EXPORT", 39, 33, "HIGH", "STRONG"], ["ALUMINUM_ORE", "EXPORT", 44, 38, "HIGH", "GROWING"], ["QUARTZ_SAND", "EXPORT", 27, 22, "ABUNDANT", "WEAK"]],
  H51: [["FUEL", "EXCHANGE", 76, 71, "HIGH", "STRONG"], ["IRON", "EXPORT", 132, 121, "HIGH", "STRONG"], ["COPPER", "EXPORT", 118, 109, "MODERATE", "GROWING"], ["IRON_ORE", "IMPORT", 66, 61, "SCARCE", "STRONG"], ["ALUMINUM_ORE", "IMPORT", 79, 73, "LIMITED", "GROWING"], ["QUARTZ_SAND", "IMPORT", 48, 44, "SCARCE", "WEAK"]],
  J60: [["FUEL", "EXCHANGE", 95, 88, "LIMITED", "WEAK"], ["FIREARMS", "EXPORT", 1510, 1402, "MODERATE", "RESTRICTED"], ["FOOD", "IMPORT", 520, 488, "SCARCE", "STRONG"]],
};

function buildMarket(suffix: string, drift = 0): Market {
  const goods = marketSpecs[suffix]!;
  const tg = (kind: G[1]) => goods.filter(g => g[1] === kind).map(g => ({ symbol: g[0] as TradeSymbol, name: g[0], description: "" }));
  return {
    symbol: wp(suffix),
    exports: tg("EXPORT"),
    imports: tg("IMPORT"),
    exchange: tg("EXCHANGE"),
    tradeGoods: goods.map(([symbol, type, buy, sell, supply, act]) => {
      const f = 1 + drift * (0.5 + Math.random() * 0.5);
      return {
        symbol: symbol as TradeSymbol,
        type,
        tradeVolume: symbol === "FUEL" ? 180 : 20 + Math.round(Math.random() * 4) * 10,
        supply: supply as SupplyLevel,
        activity: act as ActivityLevel,
        purchasePrice: Math.round(buy * f),
        sellPrice: Math.round(sell * f),
      };
    }),
  };
}

for (const suffix of Object.keys(marketSpecs)) {
  // ~14h of price history, one read every ~50 min, with a gentle random walk.
  let drift = 0;
  for (let t = now - 14 * HOUR; t < now; t += rand(35, 65) * MIN) {
    drift = Math.max(-0.25, Math.min(0.25, drift + rand(-0.05, 0.05)));
    prices.record(buildMarket(suffix, drift), t);
  }
  const m = buildMarket(suffix);
  prices.record(m, now - rand(2, 40) * MIN);
  mirror.set(storeKeys.market(SYS, wp(suffix)), m);
}

// ---------------------------------------------------------------- agent & credits

const agent: Agent = {
  accountId: "demo-account",
  symbol: AGENT,
  headquarters: wp("A1"),
  credits: 0,
  startingFaction: "COSMIC",
  shipCount: 6,
};
{
  let credits = 175_000;
  for (let t = now - 48 * HOUR; t < now - 20 * MIN; t += rand(12, 40) * MIN) {
    const r = Math.random();
    credits += r < 0.12 ? -Math.round(rand(8_000, 40_000)) : r < 0.3 ? -Math.round(rand(300, 2_500)) : Math.round(rand(900, 6_500));
    creditHistory.record(credits, t);
  }
  agent.credits = credits;
  observeAgent(agent);
}

// ---------------------------------------------------------------- fleet

const component = <S extends string>(symbol: S, extra: Record<string, unknown> = {}) => ({
  symbol, name: symbol, description: "", condition: 0.94, integrity: 0.97, quality: 4,
  requirements: { power: 1, crew: 1 }, ...extra,
});

function mkShip(o: {
  n: number; role: string; frame: string; at: string; status: Ship["nav"]["status"]; fuel: [number, number];
  cargo: [string, number][]; capacity: number; mounts?: string[]; modules?: string[]; speed?: number;
  route?: { from: string; to: string; departed: number; arrival: number }; cooldownSec?: number;
}): Ship {
  const at = coords.get(o.at)!;
  const routeWp = (s: string) => {
    const w = coords.get(s)!;
    return { symbol: s, type: w.type, systemSymbol: SYS, x: w.x, y: w.y };
  };
  const route = o.route ?? { from: o.at, to: o.at, departed: now - HOUR, arrival: now - HOUR + 5 * MIN };
  const units = o.cargo.reduce((a, [, u]) => a + u, 0);
  return {
    symbol: `${AGENT}-${o.n}`,
    registration: { name: `${AGENT}-${o.n}`, factionSymbol: "COSMIC", role: o.role as Ship["registration"]["role"] },
    nav: {
      systemSymbol: SYS,
      waypointSymbol: o.route ? o.route.to : at.symbol,
      route: { origin: routeWp(route.from), destination: routeWp(route.to), departureTime: iso(route.departed), arrival: iso(route.arrival) },
      status: o.status,
      flightMode: "CRUISE",
    },
    crew: { current: 20, required: 10, capacity: 40, rotation: "STRICT", morale: 92, wages: 0 },
    frame: component(o.frame, { moduleSlots: 4, mountingPoints: 3, fuelCapacity: o.fuel[1] }),
    reactor: component("REACTOR_FISSION_I", { powerOutput: 31 }),
    engine: component("ENGINE_ION_DRIVE_I", { speed: o.speed ?? 30 }),
    modules: (o.modules ?? ["MODULE_CARGO_HOLD_I", "MODULE_CREW_QUARTERS_I"]).map(m => component(m)),
    mounts: (o.mounts ?? []).map(m => component(m)),
    cargo: { capacity: o.capacity, units, inventory: o.cargo.map(([symbol, u]) => ({ symbol: symbol as never, name: symbol, description: "", units: u })) },
    fuel: { current: o.fuel[0], capacity: o.fuel[1] },
    cooldown: {
      shipSymbol: `${AGENT}-${o.n}`,
      totalSeconds: o.cooldownSec ? 70 : 0,
      remainingSeconds: o.cooldownSec ?? 0,
      ...(o.cooldownSec ? { expiration: iso(now + o.cooldownSec * 1000) } : {}),
    },
  } as unknown as Ship;
}

const fleet: Ship[] = [
  mkShip({ n: 1, role: "COMMAND", frame: "FRAME_FRIGATE", at: wp("A1"), status: "DOCKED", fuel: [388, 400], cargo: [["ELECTRONICS", 18]], capacity: 40, mounts: ["MOUNT_SENSOR_ARRAY_I", "MOUNT_MINING_LASER_I"], modules: ["MODULE_CARGO_HOLD_II", "MODULE_CREW_QUARTERS_I", "MODULE_MINERAL_PROCESSOR_I"], speed: 36 }),
  mkShip({ n: 2, role: "SATELLITE", frame: "FRAME_PROBE", at: wp("D40"), status: "DOCKED", fuel: [0, 0], cargo: [], capacity: 0, modules: [], speed: 3 }),
  mkShip({ n: 3, role: "EXCAVATOR", frame: "FRAME_DRONE", at: wp("F45"), status: "IN_ORBIT", fuel: [61, 80], cargo: [["IRON_ORE", 7], ["COPPER_ORE", 4], ["QUARTZ_SAND", 2]], capacity: 15, mounts: ["MOUNT_MINING_LASER_I"], modules: ["MODULE_CARGO_HOLD_I"], cooldownSec: 38, speed: 9 }),
  mkShip({ n: 4, role: "HAULER", frame: "FRAME_LIGHT_FREIGHTER", at: wp("F45"), status: "IN_TRANSIT", fuel: [214, 600], cargo: [["IRON_ORE", 52], ["ALUMINUM_ORE", 18]], capacity: 80, route: { from: wp("F45"), to: wp("H51"), departed: now - 6 * MIN, arrival: now + 3.5 * MIN }, speed: 30 }),
  mkShip({ n: 5, role: "EXCAVATOR", frame: "FRAME_DRONE", at: wp("F45"), status: "IN_ORBIT", fuel: [12, 80], cargo: [["IRON_ORE", 15]], capacity: 15, mounts: ["MOUNT_MINING_LASER_I"], modules: ["MODULE_CARGO_HOLD_I"], speed: 9 }),
  mkShip({ n: 6, role: "HAULER", frame: "FRAME_LIGHT_FREIGHTER", at: wp("A1"), status: "IN_TRANSIT", fuel: [455, 600], cargo: [["MACHINERY", 40]], capacity: 80, route: { from: wp("D40"), to: wp("A1"), departed: now - 2 * MIN, arrival: now + 11 * MIN }, speed: 30 }),
];
mirror.set(storeKeys.fleet, { ships: fleet });

// ---------------------------------------------------------------- contracts

const contracts: Contract[] = [
  {
    id: "cmf3k2x9a00a1s60cqz8w7d1e", factionSymbol: "COSMIC", type: "PROCUREMENT", accepted: true, fulfilled: false,
    expiration: iso(now - 20 * HOUR), deadlineToAccept: iso(now - 20 * HOUR),
    terms: { deadline: iso(now + 26 * HOUR), payment: { onAccepted: 18_240, onFulfilled: 91_870 },
      deliver: [{ tradeSymbol: "IRON_ORE", destinationSymbol: wp("H51"), unitsRequired: 120, unitsFulfilled: 68 }] },
  },
  {
    id: "cmf3m7q1b00b2s60d1a2e3f4g", factionSymbol: "COSMIC", type: "PROCUREMENT", accepted: false, fulfilled: false,
    expiration: iso(now + 5 * HOUR), deadlineToAccept: iso(now + 5 * HOUR),
    terms: { deadline: iso(now + 6 * 24 * HOUR), payment: { onAccepted: 9_400, onFulfilled: 61_200 },
      deliver: [{ tradeSymbol: "ALUMINUM_ORE", destinationSymbol: wp("D40"), unitsRequired: 70, unitsFulfilled: 0 }] },
  },
  {
    id: "cmf2z0p4c00c3s60e5h6i7j8k", factionSymbol: "COSMIC", type: "PROCUREMENT", accepted: true, fulfilled: true,
    expiration: iso(now - 40 * HOUR), deadlineToAccept: iso(now - 40 * HOUR),
    terms: { deadline: iso(now - 30 * HOUR), payment: { onAccepted: 12_100, onFulfilled: 70_450 },
      deliver: [{ tradeSymbol: "COPPER_ORE", destinationSymbol: wp("A3"), unitsRequired: 60, unitsFulfilled: 60 }] },
  },
];
mirror.set(storeKeys.contracts, contracts);

// ---------------------------------------------------------------- memory

memory.setGoal("Finish the IRON_ORE procurement for COSMIC (120 units to H51) before the deadline", iso(now + 26 * HOUR));
memory.setGoal("Save 400k credits for a second light freighter");
memory.remember("F45 (engineered asteroid) exports IRON_ORE at ~34 cr; H51 imports it at ~61 cr — the core mining loop.", "strategy", ["trade-route", "IRON_ORE"], 5);
memory.remember("E43 fuel station has the cheapest FUEL in the system (~64 cr).", "fact", ["fuel", "E43"], 4);
memory.remember("D40 sells ELECTRONICS at ~1290; A1 buys them at ~1700. Good hauler run when idle.", "strategy", ["trade-route", "ELECTRONICS"], 4);
memory.remember("NYUU-5 keeps running low on fuel after long mining shifts — refuel at F45 before cargo fills.", "observation", ["NYUU-5", "fuel"], 3);
memory.remember("J60 is a pirate base; FIREARMS are RESTRICTED there. Avoid for now.", "fact", ["J60", "risk"], 3);
memory.remember("Jump gate I53 is still under construction — no cross-system travel yet.", "fact", ["I53", "jump-gate"], 2);

// ---------------------------------------------------------------- wake history

type Call = { tool: string; args: Record<string, unknown>; outcome?: ToolOutcome; summary: string; result?: unknown; req?: number; ms?: number; guards?: { guard: string; ok: boolean; reason?: string }[] };
type Script = { reason: string; rounds: { thought: string; calls: Call[] }[]; summary: string; creditDelta: number };

const scripts: Script[] = [
  {
    reason: "NYUU-3 extraction cooldown done",
    creditDelta: 0,
    rounds: [
      { thought: "NYUU-3 is off cooldown at F45 with 13/15 cargo. One more extraction fills it; then transfer to the hauler when it returns.", calls: [
        { tool: "extract", args: { shipSymbol: "NYUU-3" }, summary: "NYUU-3 extracted 2x IRON_ORE, cargo 15/15", req: 2, ms: 1340, guards: [{ guard: "knownShip", ok: true }, { guard: "inOrbit", ok: true }, { guard: "cooldownClear", ok: true }, { guard: "shipHasMount(MOUNT_MINING_LASER)", ok: true }] },
      ] },
      { thought: "Cargo full. Nothing else to do for NYUU-3 until the hauler is back; ending the wake.", calls: [
        { tool: "end_loop", args: { summary: "NYUU-3 mined 2 IRON_ORE and is full; waiting for NYUU-4 to return and collect." }, summary: "loop finished" },
      ] },
    ],
    summary: "NYUU-3 mined 2 IRON_ORE and is full; waiting for NYUU-4 to return and collect.",
  },
  {
    reason: "NYUU-4 arrival at X1-KD26-H51",
    creditDelta: 4_390,
    rounds: [
      { thought: "NYUU-4 arrived at H51 with 52 IRON_ORE and 18 ALUMINUM_ORE. Plan: dock, deliver IRON_ORE to the contract, sell the aluminum ore, refuel, and check the market.", calls: [
        { tool: "dock", args: { shipSymbol: "NYUU-4" }, summary: "NYUU-4 docked at X1-KD26-H51", req: 2, ms: 1210 },
        { tool: "get_market", args: { waypointSymbol: wp("H51") }, summary: "X1-KD26-H51: 6 goods with live prices", req: 1, ms: 640 },
      ] },
      { thought: "Market confirms H51 imports ALUMINUM_ORE at 73. Deliver the iron ore to the contract first.", calls: [
        { tool: "deliver_contract_cargo", args: { contractId: "cmf3k2x9a00a1s60cqz8w7d1e", shipSymbol: "NYUU-4", tradeSymbol: "IRON_ORE", units: 52 }, summary: "delivered 52x IRON_ORE to cmf3k2x9a00a1s60cqz8w7d1e", req: 2, ms: 1420 },
        { tool: "sell_cargo", args: { shipSymbol: "NYUU-4", symbol: "ALUMINUM_ORE", units: 18 }, summary: "NYUU-4 sold 18x ALUMINUM_ORE for 1314 cr", req: 3, ms: 1890 },
        { tool: "refuel", args: { shipSymbol: "NYUU-4" }, summary: "NYUU-4 +386 fuel for 2744 cr", req: 3, ms: 1770 },
      ] },
      { thought: "Contract now at 120/120 once this lands — fulfill it, then send NYUU-4 back to F45.", calls: [
        { tool: "fulfill_contract", args: { contractId: "cmf3k2x9a00a1s60cqz8w7d1e" }, outcome: "api-error", summary: "[400 4502] Contract terms not yet met — data: {\"contractId\":\"cmf3k2x9a00a1s60cqz8w7d1e\",\"deliveredUnits\":120}", req: 1, ms: 520 },
        { tool: "orbit", args: { shipSymbol: "NYUU-4" }, summary: "NYUU-4 in orbit at X1-KD26-H51", req: 2, ms: 1100 },
      ] },
      { thought: "Fulfill failed — probably a delivery lag. Retry next wake. Heading back to F45.", calls: [
        { tool: "navigate", args: { shipSymbol: "NYUU-4", waypointSymbol: wp("F45") }, summary: "NYUU-4 in transit to X1-KD26-F45 (CRUISE), fuel 522/600", req: 4, ms: 2310 },
        { tool: "end_loop", args: { summary: "Delivered 52 IRON_ORE (contract 120/120), sold 18 ALUMINUM_ORE and refuelled. Fulfill was rejected — retrying next wake. NYUU-4 heading back to F45." }, summary: "loop finished" },
      ] },
    ],
    summary: "Delivered 52 IRON_ORE (contract 120/120), sold 18 ALUMINUM_ORE and refuelled. Fulfill was rejected — retrying next wake. NYUU-4 heading back to F45.",
  },
  {
    reason: "fallback periodic wake",
    creditDelta: -2_210,
    rounds: [
      { thought: "Periodic check. NYUU-5 is at 12/80 fuel and full of ore. Try to navigate it to H51 to sell directly.", calls: [
        { tool: "navigate", args: { shipSymbol: "NYUU-5", waypointSymbol: wp("H51") }, outcome: "guard-rejected", summary: "guard hasFuelForRoute: fuel 12/80 < 79 needed (CRUISE) — refuel first, or use flightMode DRIFT (1 fuel, slow)", req: 3, ms: 1650, guards: [{ guard: "knownShip", ok: true }, { guard: "notInTransit", ok: true }, { guard: "inOrbit", ok: true }, { guard: "hasFuelForRoute", ok: false, reason: "fuel 12/80 < 79 needed (CRUISE)" }] },
      ] },
      { thought: "Not enough fuel. F45 sells FUEL — dock and refuel there first, then transfer ore to NYUU-4 when it arrives instead of flying the drone.", calls: [
        { tool: "dock", args: { shipSymbol: "NYUU-5" }, summary: "NYUU-5 docked at X1-KD26-F45", req: 2, ms: 1180 },
        { tool: "refuel", args: { shipSymbol: "NYUU-5" }, summary: "NYUU-5 +68 fuel for 2210 cr", req: 3, ms: 1830 },
        { tool: "remember", args: { content: "Drones should not haul: transfer ore to NYUU-4 at F45 instead.", kind: "strategy", tags: ["NYUU-5"] }, summary: "noted (strategy): Drones should not haul: transfer ore to NYUU-4 at F45 instead." },
      ] },
      { thought: "Done for now.", calls: [
        { tool: "end_loop", args: { summary: "NYUU-5 couldn't reach H51 on 12 fuel, so it refuelled at F45 and will hand its ore to NYUU-4 instead." }, summary: "loop finished" },
      ] },
    ],
    summary: "NYUU-5 couldn't reach H51 on 12 fuel, so it refuelled at F45 and will hand its ore to NYUU-4 instead.",
  },
];

// Seed ~14 historical wakes: the last three carry full transcripts.
{
  let credits = creditHistory.latest()?.credits ?? agent.credits;
  const reasons = ["NYUU-3 extraction cooldown done", "NYUU-4 arrival at X1-KD26-F45", "fallback periodic wake", "NYUU-6 arrival at X1-KD26-D40", "harness start", "NYUU-5 extraction cooldown done"];
  const blurbs = [
    "Mined 3 COPPER_ORE with NYUU-3; cargo 11/15. Waiting on cooldown.",
    "NYUU-4 collected 30 IRON_ORE from both drones and is heading to H51.",
    "Nothing actionable — all ships busy. Next wake at NYUU-4 arrival.",
    "Bought 40 MACHINERY at D40 (905/unit) for the A1 run; NYUU-6 departing.",
    "Recovered state after restart; re-scheduled arrivals and cooldowns.",
    "Negotiated a new ALUMINUM_ORE contract offer at A1 (not accepted yet).",
  ];
  for (let i = 0; i < 11; i++) {
    const id = summaries.nextWakeId();
    const ts = now - (11 - i) * rand(28, 42) * MIN - 30 * MIN;
    const delta = Math.round(rand(-3_000, 5_000));
    const tokens = { prompt: Math.round(rand(9_000, 26_000)), completion: Math.round(rand(300, 1_600)), cached: Math.round(rand(4_000, 9_000)) };
    runtime.llm.calls += 3; runtime.llm.promptTokens += tokens.prompt; runtime.llm.completionTokens += tokens.completion; runtime.llm.cachedTokens += tokens.cached;
    summaries.add({
      ts,
      reason: reasons[i % reasons.length]!,
      text: blurbs[i % blurbs.length]!,
      actions: [{ tool: "extract", outcome: "ok" }, { tool: "get_market", outcome: "ok" }],
      stats: { startedAt: ts - 30_000, durationMs: Math.round(rand(8_000, 60_000)), rounds: Math.round(rand(2, 6)), requests: Math.round(rand(4, 22)), tokens, creditsStart: credits, creditsEnd: credits + delta, endedBy: "end_loop" },
    });
    credits += delta;
  }
}

async function playScript(sc: Script, opts: { baseTs?: number; live: boolean }): Promise<void> {
  const id = summaries.nextWakeId();
  let ts = opts.baseTs ?? Date.now();
  const startedAt = ts;
  const step = async (ms: number) => { if (opts.live) await sleep(ms); ts = opts.live ? Date.now() : ts + ms; };
  const creditsStart = creditHistory.latest()?.credits ?? agent.credits;
  runtime.wake = { id, reason: sc.reason, startedAt, round: 0 };
  if (opts.live) bus.emit({ type: "AgentWoke", ts, reason: sc.reason, scope: "all" });
  activity.append({ kind: "wake", ts, wake: id, text: `wake #${id}: ${sc.reason} (scope all)` });
  let requests = 0;
  let round = 0;
  const tokens = { prompt: 0, completion: 0, cached: 0 };
  for (const r of sc.rounds) {
    runtime.wake.round = ++round;
    await step(opts.live ? rand(1800, 3200) : 4_000);
    tokens.prompt += Math.round(rand(7_000, 14_000)); tokens.completion += Math.round(rand(120, 600)); tokens.cached += 5_000;
    activity.append({ kind: "thought", ts, wake: id, text: r.thought });
    if (opts.live) bus.emit({ type: "PlanUpdated", ts, thought: r.thought, calls: r.calls.map(c => ({ tool: c.tool, args: c.args })) });
    for (const c of r.calls) {
      await step(opts.live ? (c.ms ?? 300) : (c.ms ?? 50));
      const outcome = c.outcome ?? "ok";
      requests += c.req ?? 0;
      activity.append({ kind: "tool", ts, wake: id, tool: c.tool, args: c.args, outcome, summary: c.summary, result: outcome === "ok" ? c.result : undefined, guards: c.guards ?? [], requestsSpent: c.req ?? 0, durationMs: c.ms ?? 0 });
      if (opts.live) {
        bus.emit({ type: "ToolCalled", ts, tool: c.tool, args: c.args, outcome, summary: c.summary, requestsSpent: c.req ?? 0, durationMs: c.ms ?? 0 });
        runtime.requestsTotal += c.req ?? 0;
        runtime.rate = { limit: 30, remaining: Math.max(2, (runtime.rate.remaining ?? 30) - (c.req ?? 0)), resetAt: Date.now() + 10_000 };
        bus.emit({ type: "RateBudgetChanged", ts, ...runtime.rate });
        applyEffects(c);
      }
    }
  }
  const creditsEnd = creditsStart + sc.creditDelta;
  if (opts.live) {
    runtime.llm.calls += round; runtime.llm.promptTokens += tokens.prompt; runtime.llm.completionTokens += tokens.completion; runtime.llm.cachedTokens += tokens.cached;
  }
  summaries.add({
    ts,
    reason: sc.reason,
    text: sc.summary,
    details: sc.rounds.flatMap(r => r.calls).map(c => c.summary).join("; "),
    actions: sc.rounds.flatMap(r => r.calls).map(c => ({ tool: c.tool, outcome: c.outcome ?? "ok" })),
    stats: { startedAt, durationMs: ts - startedAt, rounds: round, requests, tokens, creditsStart, creditsEnd, endedBy: "end_loop" },
  });
  activity.append({ kind: "summary", ts, wake: id, text: sc.summary });
  checkpointStore.save({ wakeId: id, reason: sc.reason, plan: { thought: sc.rounds.at(-1)!.thought, calls: sc.rounds.at(-1)!.calls.map(c => ({ tool: c.tool, args: c.args })) }, resultsSummary: sc.summary });
  runtime.wake = null;
  runtime.lastWakeEndedAt = ts;
  if (opts.live) bus.emit({ type: "LoopSummary", ts, wake: id, text: sc.summary });
}

// Live side effects so the fleet, credits and map visibly move.
function applyEffects(c: Call): void {
  const ship = fleet.find(s => s.symbol === c.args["shipSymbol"]);
  const credits = creditHistory.latest()?.credits ?? agent.credits;
  const money = /(?:for|\+)\s?(\d+) cr/.exec(c.summary);
  if (money && (c.tool === "sell_cargo" || c.tool === "refuel" || c.tool === "buy_cargo")) {
    const amt = Number(money[1]);
    observeAgent({ ...agent, credits: credits + (c.tool === "sell_cargo" ? amt : -amt) });
  }
  if (!ship || (c.outcome && c.outcome !== "ok")) return;
  if (c.tool === "dock") ship.nav.status = "DOCKED";
  if (c.tool === "orbit") ship.nav.status = "IN_ORBIT";
  if (c.tool === "refuel") ship.fuel.current = ship.fuel.capacity;
  if (c.tool === "extract") {
    ship.cargo.units = ship.cargo.capacity;
    ship.cooldown = { ...ship.cooldown, remainingSeconds: 70, expiration: iso(Date.now() + 70_000) };
  }
  if (c.tool === "navigate") {
    const to = String(c.args["waypointSymbol"]);
    const from = ship.nav.waypointSymbol;
    const a = coords.get(from)!, b = coords.get(to)!;
    ship.nav.status = "IN_TRANSIT";
    ship.nav.waypointSymbol = to;
    ship.nav.route = {
      origin: { symbol: from, type: a.type, systemSymbol: SYS, x: a.x, y: a.y },
      destination: { symbol: to, type: b.type, systemSymbol: SYS, x: b.x, y: b.y },
      departureTime: iso(Date.now()),
      arrival: iso(Date.now() + 90_000),
    };
    ship.fuel.current = Math.max(0, ship.fuel.current - 78);
  }
  upsertShip(ship);
}

// Play the scripts once as history (backdated), then keep them running live.
{
  let t = now - 26 * MIN;
  for (const sc of scripts) {
    await playScript(sc, { baseTs: t, live: false });
    t += 8 * MIN;
  }
}
runtime.rate = { limit: 30, remaining: 27, resetAt: now + 10_000 };

// Arrivals: flip ships whose ETA passed to IN_ORBIT at the destination.
setInterval(() => {
  for (const s of fleet) {
    if (s.nav.status === "IN_TRANSIT" && Date.parse(s.nav.route.arrival) <= Date.now()) {
      s.nav.status = "IN_ORBIT";
      upsertShip(s);
    }
  }
  if ((runtime.rate.remaining ?? 30) < 30) {
    runtime.rate = { ...runtime.rate, remaining: Math.min(30, (runtime.rate.remaining ?? 0) + 2) };
  }
}, 2_000);

let next = 0;
let busy = false;
const liveWake = async (reason?: string) => {
  if (busy) return;
  busy = true;
  try {
    const sc = scripts[next++ % scripts.length]!;
    await playScript(reason ? { ...sc, reason } : sc, { live: true });
  } finally {
    busy = false;
    if (!scheduler.paused && scheduler.pending().length === 0) scheduler.schedule(Date.now() + 45_000, "fallback periodic wake");
  }
};

scheduler.onWake(w => void liveWake(w.reason));
bus.subscribe(e => {
  if (e.type !== "Command") return;
  if (e.command === "pause") scheduler.setPaused(true);
  else if (e.command === "resume") scheduler.setPaused(false);
  else if (e.command === "wake") void liveWake(e.reason ?? "manual wake");
  else if (e.command === "directive") scheduler.setDirective(e.text ?? null);
});

scheduler.schedule(now + 25_000, "NYUU-3 extraction cooldown done", "NYUU-3");
scheduler.schedule(now + 3.5 * MIN + 2_000, "NYUU-4 arrival at X1-KD26-H51", "NYUU-4");
scheduler.schedule(now + 11 * MIN + 2_000, "NYUU-6 arrival at X1-KD26-A1", "NYUU-6");

startPanel();
console.log(`[demo] seeded fixture state in ${dataDir}; simulated wakes run every ~45s`);
