# Harness Architecture & Design

Design document for the SpaceTradingHarness: the tool surface exposed to the agent, the monitoring web panel, and the architectural rules that keep the codebase modular and duplicate-free as it grows.

- API reference: [`docs/openapi/`](./openapi/README.md) (64 operations, 78 schemas, generated from `openapi.json`)
- Practical API notes: [`HARNESS.md`](../HARNESS.md)

---

## 1. System Overview

```
                    ┌─────────────────────────────────────────────┐
                    │                  Harness core               │
                    │                                             │
 SpaceTraders API ◄─┤  transport ─► client ─► services ─► tools   │
 (the ONLY writer   │    │            (typed     (guards,   │     │
  to the API)       │    │             wrappers)  handlers) │     │
                    │    ▼                                 ▼     │
                    │  rate limiter                    agent loop │
                    │  error normalizer                scheduler  │
                    │    │                                 │     │
                    │    ▼                                 ▼     │
                    │  state mirror (panel-only) ◄──── tool executor   │
                    │    │                                         │
                    │  event bus ◄── socket.io ingest ◄── API     │
                    └────┬───────────────────────────┬────────────┘
                         │ REST snapshot             │ SSE stream
                         ▼                           ▼
                      Web panel (read-only; never calls SpaceTraders)
```

Three inviolable rules:

1. **Single writer.** Only the harness core talks to SpaceTraders. The panel, the agent, and any scripts all go through it. This protects the ~2 req/s budget and keeps the agent token server-side.
2. **One direction of dependency.** `transport → client → services → tools/agent → panel`. Nothing lower may import anything higher. No layer skips the layer below (panel never touches client; tools never call fetch).
3. **Spec is the single source of truth.** Types, route constants, and enums are generated from `openapi.json`. Hand-writing a DTO or URL that the spec already defines is a bug.

---

## 2. Tool Surface

### 2.1 Design principles

- **Do not map tools 1:1 to routes.** The API is rate-limited; `GET /my/ships/{ship}` already returns nav + cargo + fuel + cooldown + modules in one call. Fewer, richer tools = fewer requests burned. 64 routes compress to ~25 tools.
- **Every mutating tool declares preconditions** (composable guards) that the executor checks *before* spending a request — invalid states fail locally, not with a 4xx from the server.
- **Every tool declares `rateCost`** (API requests it will burn) so the executor can budget and the panel can display consumption.
- **Reads always hit the API.** The agent never acts on cached state — every read tool, guard, and working-memory build fetches live data (the transport's rate limiter paces it). The one exception is within a single wake: an identical read repeated *before any action* is answered from that wake's cache, which is cleared as soon as an action executes. API responses are written to a **panel-only state mirror** used solely for user visualization; nothing in the agent path may read it.
- **Results are compact projections.** Tool results go through `state/projections.ts` (no prose descriptions, no third-party transaction logs) so the fields the agent decides on — prices, supply, routes, cargo — always fit the per-result size cap.
- **Waiting is a tool.** Long actions (travel, cooldowns) resolve via scheduled wakeups, never polling loops.

### 2.2 Tool definition contract

Every tool is a declarative object registered in one place. No free-floating handlers.

```ts
interface ToolDefinition {
  name: string                  // e.g. "buy_cargo"
  description: string           // what the LLM sees — write it carefully
  input: ZodSchema              // validated before the handler runs
  preconditions: Guard[]        // checked against state cache, zero API cost
  rateCost: number              // estimated requests burned (for budgeting/panel)
  handler: (input, ctx) => Promise<ToolResult>
}

// Guards are composable, reusable predicates over cached state:
const isDocked:        Guard = (i, s) => s.ship(i.shipSymbol).nav.status === "DOCKED"
const atWaypointTrait: (t) => Guard
const marketSells:     (good) => Guard
const cargoSpaceFor:   (units) => Guard
const cooldownClear:   Guard
```

`buy_cargo` is then just `[isDocked, atWaypointTrait("MARKETPLACE"), marketSells(symbol), cargoSpaceFor(units), withinTradeVolume(units)]` — each guard written once, reused across tools (see §5.3).

### 2.3 Read tools (safe, always fresh)

| Tool | Wraps | Notes |
|---|---|---|
| `get_server_status` | `GET /` | reset date, announcements, leaderboards |
| `get_my_agent` | `GET /my/agent` | credits, HQ, rank |
| `get_agent_events` | `GET /my/agent/events` | credit-changing events feed |
| `get_systems` | `GET /systems` | paginated; static per reset → cache hard |
| `get_system_waypoints` | `GET /systems/{s}/waypoints` | filter by trait (`MARKETPLACE`, `SHIPYARD`, …) |
| `get_waypoint` / `get_market` / `get_shipyard` / `get_jump_gate` | `GET .../waypoints/{w}/*` | dynamic; short TTL |
| `get_construction` | `GET .../construction` | for supply planning |
| `get_supply_chain` | `GET /market/supply-chain` | trade relationships — planning input |
| `get_factions` / `get_my_factions` | `GET /factions`, `GET /my/factions` | static per reset |
| `get_agents` | `GET /agents` | public leaderboard-ish data |
| `list_ships` | `GET /my/ships` | full fleet state in one call |
| `get_ship` | `GET /my/ships/{s}` | nav + cargo + fuel + cooldown + modules |
| `list_contracts` / `get_contract` | `GET /my/contracts[/{id}]` | |

### 2.4 Action tools (mutating; guards required)

| Tool | Wraps | Preconditions (guards) |
|---|---|---|
| `navigate` | `POST .../navigate` | in orbit/docked, fuel ≥ route cost; returns ETA → schedule wakeup |
| `warp` / `jump` | `POST .../warp`, `.../jump` | warp drive / jump gate + antimatter in cargo |
| `dock` / `orbit` | `POST .../dock`, `.../orbit` | nav-state transitions |
| `refuel` | `POST .../refuel` | docked, market sells fuel, credits |
| `extract` / `extract_with_survey` | `POST .../extract[/survey]` | in orbit, mining mount, cooldown clear |
| `siphon` | `POST .../siphon` | in orbit, gas siphon mount, cooldown clear |
| `create_survey` | `POST .../survey` | in orbit, surveyor mount, cooldown clear |
| `buy_cargo` | `POST .../purchase` | docked at marketplace, sells good, trade volume, cargo space, credits |
| `sell_cargo` | `POST .../sell` | docked at marketplace, buys good, cargo present |
| `transfer_cargo` | `POST .../transfer` | ships co-located, space in target |
| `jettison` | `POST .../jettison` | in orbit, cargo present |
| `refine` | `POST .../refine` | docked, refinery module, raw materials present |
| `accept_contract` | `POST /my/contracts/{id}/accept` | contract offered, not expired |
| `deliver_contract_cargo` | `POST /my/contracts/{id}/deliver` | contract accepted, good required, cargo present, at destination |
| `fulfill_contract` | `POST /my/contracts/{id}/fulfill` | all terms delivered |
| `negotiate_contract` | `POST .../negotiate/contract` | docked at faction waypoint, cooldown |
| `purchase_ship` | `POST /my/ships` | credits, ship docked at shipyard waypoint |
| `install_module` / `remove_module` | `POST .../modules/{install,remove}` | docked at shipyard |
| `install_mount` / `remove_mount` | `POST .../mounts/{install,remove}` | docked at shipyard |
| `scan_systems` / `scan_waypoints` / `scan_ships` | `POST .../scan/*` | in orbit, sensor mounts, cooldown |
| `repair_ship` | `POST .../repair` | docked at shipyard with repair services |
| `scrap_ship` | `POST .../scrap` | docked at shipyard with scrap services |

### 2.5 Harness-internal tools (no API route)

| Tool | Purpose |
|---|---|
| `end_loop({wakeAt?})` | finish the wake; optionally wake at a chosen time (arrivals/cooldowns auto-schedule regardless) |
| `get_market_memory` | harness-local price history — every `get_market` records prices to `data/prices.json` |
| `plan_route(origin, destination)` | fuel/time-optimal path over cached waypoint graph |
| `get_agent_events` | recent agent events feed (credit changes etc.) |
| `get_jump_gate` / `get_construction` / `get_supply_chain` | universe data reads |
| `get_rate_budget` | remaining requests this window — let the agent self-throttle |
| `remember / recall / forget` | persistent memory between loops — see §6.2 |
| `set_goal / complete_goal` | durable objectives with deadline + status — see §6.2 |

### 2.6 Deliberately not tools

- `register` — bootstrap-only, run once by the user from the panel/settings, never by the agent.
- `GET .../cargo`, `/nav`, `/cooldown`, `/modules`, `/mounts` — subsumed by `get_ship`; exposing them would burn rate limit for slices of an already-returned object.
- ~~`PATCH .../nav`~~ — folded into `navigate` as a `flightMode` option.
- `GET /my/socket.io` — connection management belongs to the harness event ingest (`src/events/socket.ts`), not the agent.
- `chart` — low value; revisit if leaderboard play matters.

### 2.7 Example minimal set (trading agent MVP)

```
get_status, get_my_agent, get_systems, get_waypoints, get_market,
list_ships, navigate, dock, orbit, refuel, buy_cargo, sell_cargo,
get_contracts, accept_contract, deliver_contract_cargo, fulfill_contract,
wait_until
```

17 tools, one working economy loop.

---

## 3. Monitoring Web Panel

### 3.1 Architecture

The panel is **read-only against the harness**, never against SpaceTraders:

- The harness core maintains a **state mirror** (fleet, contracts, universe — written as a side effect of agent API calls, read only by the panel) and an **event bus**.
- The **socket.io ingest** (`GET /my/socket.io` → signed Socket.IO URL) feeds server-pushed game events (arrivals, market updates, ship events) into the same bus — no polling the game for status changes.
- The panel backend exposes a **snapshot REST endpoint + one SSE stream**. All panel widgets subscribe to the stream and hydrate from the snapshot.
- The **agent token never leaves the server.** Panel auth is separate (even a simple shared secret at first).

```
game events (socket.io) ─┐
tool executor results ───┼─► event bus ─► SSE /api/events ─► panel widgets
scheduler wakeups ───────┘       │
                                  └─► activity log (persisted, data/*.jsonl)
```

### 3.2 Panel views (value order)

1. **Dashboard** — credits, fleet size, agent rank, server reset countdown, **rate-limit gauge** (tracked from `X-Req-RateLimit-*` headers on every response, fed through the bus).
2. **Fleet view** — per-ship cards: nav status, location, fuel %, cargo fill, cooldown remaining, current task; live via SSE.
3. **Activity log** — the observability centerpiece. Every tool call: name, args, result summary, duration, guards passed/failed, API requests consumed. Makes the agent auditable and debuggable. Persist it.
4. **Contracts board** — delivery progress (delivered/required per good), deadlines, payouts.
5. **Universe map** — system/waypoint graph with ship positions, in-flight routes + ETAs, from cached `ShipNav` data. (Largest effort; ship last.)
6. **Market view** — price history charts per good from harness-local memory.

### 3.3 Panel backend surface (thin, read-only)

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | full snapshot: agent, fleet, contracts, universe summary, rate budget |
| `GET /api/ships` | fleet detail |
| `GET /api/contracts` | contracts detail |
| `GET /api/universe` | cached systems + waypoints + ship positions (map data) |
| `GET /api/events` | SSE stream of typed bus events |
| `GET /api/tools` | tool registry schemas — panel renders the agent's action space dynamically |
| `GET /api/markets` | latest snapshot per market the agent has read (compact, with `fetchedAt`) |
| `GET /api/markets/history` | price history from local memory |
| `GET /api/credits` | credit balance over time (recorded from every Agent object the harness sees) |
| `GET /api/activity` | raw activity log (`?wake=N` for one wake's transcript, `?tool=` substring, `?outcome=`) |
| `GET /api/summaries` | loop summaries + session digests (see §6.3) |
| `GET /api/plan` | current agent intent from the checkpoint (see §6.3) |

The panel binds to `127.0.0.1`, validates the `Host` header, and rejects cross-origin requests. Agent control commands (`pause`/`resume`/`wake`/`directive`) flow through the event bus as `Command` events — the panel never imports agent internals.

MVP = dashboard + fleet cards + activity log over one SSE stream.

---

## 4. Project Layout

```
src/
  transport/        # HTTP client: auth header, rate limiting, retries/backoff,
                    #   error normalization. The ONLY module allowed to fetch.
  generated/        # CODEGEN OUTPUT — types, route table, enums, guards' type
                    #   unions. Never hand-edit; regenerated from openapi.json.
  client/           # Thin typed wrappers per resource (Ships, Contracts,
                    #   Systems, Markets...). URL+params only; zero logic.
  state/            # Panel-only state mirror (no TTLs — write-only for the
                    #   agent path), projections for panel, price-history
                    #   memory, activity log store, agent memory +
                    #   consolidation (see §6.2). Modules: persist.ts (atomic
                    #   JSON/JSONL), refresh.ts (always-fresh API reads that
                    #   mirror results for the panel), prices.ts, runtime.ts
                    #   (panel-facing snapshot), projections.ts.
  events/           # Bus types + socket.io ingest + SSE fan-out.
  guards/           # Composable precondition predicates (§2.2).
  tools/            # Tool registry + definitions. Handlers are thin:
                    #   guards → client call → update cache → emit event.
  agent/            # Planning loop, scheduler/wakeups, rate budgeter,
                    #   checkpointing (see §6.1).
  panel/            # Panel REST + SSE. Reads state/events modules ONLY.
scripts/
  generate_openapi_docs.py   # existing — markdown reference
  generate_api_types.py      # NEW — openapi.json → src/generated/
```

Dependency direction (enforced, see §5.7): `panel → tools → guards/client → state → transport → generated`.

---

## 5. Preventing Duplication & Enforcing Modularity

### 5.1 Generate everything the spec already knows

The biggest duplication risk in an API harness is re-typing the API. Rule: **if `openapi.json` knows it, it is generated.**

- Route constants: `routes.fleet.getShip` → `"GET /my/ships/{shipSymbol}"`. No string URLs anywhere else. When the API changes, regenerate; every call site updates via the type system.
- Response/request types: all 78 schemas → TS types (or Python dataclasses). Hand-written DTOs are deleted on sight.
- Enums (`ShipNavStatus`, `TradeSymbol`, `WaypointTraitSymbol`, …) → generated unions. Guards and panel widgets consume the same enums.
- CI check: `generate_api_types.py && git diff --exit-code src/generated` — spec and code can never drift silently.

### 5.2 One transport, one client layer

- Every request — agent loop, tools, socket ingest bootstrap — goes through `transport`. It alone owns: bearer token injection, rate-window tracking (from `X-Req-RateLimit-*` headers), retry with backoff on 429/5xx, and error normalization into `SpaceTradersError { code, message, data }`.
- Nothing ever string-matches error messages; tools branch on `error.code` (from `GET /error-codes`, also generated into an enum).
- Pagination exists exactly once: `paginate(route, params)` yields all pages, respecting the rate budget. No tool hand-rolls `?page=` loops.

### 5.3 Guards: extract logic the moment it appears twice

The classic duplication trap is precondition if-chains copied between tools ("is the ship docked at a market that sells this good…"). Instead:

- A guard is a **named, unit-tested predicate over the state cache**, registered in `guards/`.
- Tools compose guards; guards never call the API.
- New tool needed a novel condition? Write it as a guard → it is instantly reusable and testable in isolation.
- Rule of thumb: **any boolean used by ≥2 tools must be a guard; any math used ≥2 places (fuel-for-route, cooldown remaining, trade-volume cap) must be a util with unit tests.**

### 5.4 One clock, one symbol parser

- Time (arrival timestamps, cooldown expiry, reset countdown) flows through a single `clock` service (mockable). `Date.now()` scattered through tool handlers is forbidden — it makes tests flaky and logic inconsistent.
- Symbols have structure (`X1-OE-A01` → system `X1-OE`). `parseWaypointSymbol` / `systemOf(waypoint)` live in one util; every consumer derives rather than re-implements `split("-")`.

### 5.5 State flows in one direction

- Every tool call gets a **per-call fresh reader**: guards and the handler fetch live state from the API, memoized only for the duration of that single call (one request per resource per action, shared across its guard chain).
- API responses are also written to the **state mirror** as a side effect, but the mirror is read only by the panel — guards, tools, and the agent loop always fetch fresh. No module keeps a private copy of fleet/market data; the mirror exists so the panel can visualize without burning requests.

### 5.6 Events: single emit point, typed payloads

- One bus, typed event union (`ToolCalled`, `GuardFailed`, `ShipArrived`, `CooldownExpired`, `RateBudgetChanged`, `PriceUpdated`, …).
- Producers: tool executor, socket ingest, scheduler. Consumers: SSE fan-out, activity log persistence, agent triggers.
- Widgets never poll the harness internals; they subscribe. Adding a panel widget never touches the core — it's a new subscriber.

### 5.7 Mechanical enforcement (CI)

Culture alone rots; wire the rules into the pipeline:

1. **Lint import boundaries** — e.g. ESLint `no-restricted-imports` / `import`-boundary rules:
   - `fetch`/`axios`/undici forbidden outside `src/transport` — sole documented carve-out: `src/agent/llm.ts` (the LLM endpoint is a separate trust boundary, not the SpaceTraders API). Enforced by `npm run check:arch`.
   - `src/panel` may import only from `state`, `events`, `tools` (registry metadata) — never `client`/`transport`.
   - `generated` imports allowed everywhere; nothing imports into `generated`.
2. **Typecheck as architecture** — a strict null-checked pass over generated types makes schema drift a compile error, not a runtime surprise.
3. **Codegen freshness check** — CI regenerates `src/generated` and fails on diff.
4. **Contract tests** — assert every client wrapper's route exists in `openapi.json` and its response type matches the generated schema. Catches wrapper drift when the spec updates.
5. **Tool registry test** — every registered tool has: description, input schema, ≥1 happy-path test against a fake transport, and every mutating tool has guards + guard-failure tests.
6. **No orphan handlers** — a test iterates the registry; any handler not reachable via a registration is dead code and fails the suite (prevents copy-paste forks).

### 5.8 Testing strategy (which also prevents duplication)

- **Fake transport**: scripted responses + recorded fixtures from the real API. All tool/guard/agent tests run against it — no test duplication of API scaffolding, no rate limit in CI, deterministic.
- **Guard tests**: pure state-in → boolean; no I/O at all.
- **Snapshot projections**: panel `GET /api/state` output tested against a fixture state — panel refactors can't silently change the contract.
- **Golden event streams**: replay a recorded event sequence, assert SSE output byte-stable.

### 5.9 Anti-patterns to reject in review

- A tool handler calling fetch, building a URL, or parsing a raw response body.
- The same `if (ship.nav.status === ...)` in two files.
- A second copy of "how much fuel does this route cost".
- A DTO hand-written for something `src/generated` already exports.
- The panel (or a script) holding the agent token or hitting `api.spacetraders.io` directly.
- Polling loops where a scheduled wakeup or bus subscription would do.
- A "util" file with no owner that accumulates everything (split by domain: `utils/symbols`, `utils/time`, `utils/economy`).

### 5.10 Extension points (what change looks like)

- **API ships a new version**: refresh `openapi.json` → regenerate types/docs → contract tests list exactly which client wrappers/tools broke → fix upward through layers. Panel is usually untouched.
- **New tool**: add definition + guards; register. Panel picks it up via `GET /api/tools`; activity log renders it with zero panel changes.
- **New panel widget**: subscribe to the bus; no core changes.
- **Second agent/strategy**: the agent loop is a consumer of tools like anything else — registry and core are agent-agnostic.

---

## 6. Agent Loop, Memory & Summaries

The one-sentence version: **the scheduler owns time, the executor owns safety, the LLM only decides, memory is distilled knowledge persisted at loop boundaries, and summaries are compactions of the same event log the panel already shows.**

### 6.1 Core agent loop — event-driven, not tick-based

A naive loop (`while true: think(); sleep(60)`) burns rate budget on nothing. The harness owns time; the agent only runs when woken.

```
                    ┌────────────────────────────┐
   wakeup sources:  │                            │
   ─ cooldown expiry│      ┌───────────┐         │
   ─ ship arrival   ├─────►│ scheduler │         │
   ─ socket event   │      └─────┬─────┘         │
   ─ user command   │            ▼               │
   ─ manual timer   │      agent wakes           │
                    └──────────┬─────────────────┘
                               ▼
  1. PERCEIVE   diff state since last wake (what changed: arrivals, cargo, prices,
                contract progress, events) — from cache, not fresh API calls
   2. RECALL     inject working memory: active goals, relevant notes, last N loop
                 summaries
   3. THINK      the LLM reasons in free text and calls tools via native
                 tool-calling (OpenAI SDK) — batch as many as it likes
   4. ACT        executor validates guards locally, runs the batch with bounded
                 concurrency (per-ship locks + transport rate limiter serialize
                 what must be serialized), updates cache, emits events
  5. COMMIT     write loop outcome to memory (auto) + agent may call remember()
   6. SCHEDULE   tool results auto-register wakeups (arrival ETAs, cooldowns);
                 end_loop({wakeAt?}) is the agent's own loop-finish + next-wake
                 control; harness caps (rounds, actions, wall-clock) are silent
```

Properties:

- **Deterministic shell, LLM core.** Rate budgeting, guard checks, scheduling, retries never go through the LLM — the LLM only ever chooses *which tools to call with what args*. A bug in the shell can't be "reasoned around"; it's fixed code.
- **Wakes are cheap.** If nothing meaningful changed, the agent can no-op and reschedule in one tool call. Idle fleets cost ~0 requests.
- **Per-ship concurrency.** Wakes carry a scope (all / one ship / one contract) so a ship arriving doesn't force replanning the whole fleet. A lock prevents two wakes acting on the same ship.
- **Loop boundary = checkpoint.** Every wake ends with a persisted snapshot (state + memory + current plan), so a crash or restart resumes exactly where it left off.

### 6.2 Memory between loops

Without persistent memory the agent re-learns "fuel is cheap at X1-OE-A01" every wake. Three mechanisms, because context is finite:

**1. Working memory — auto-injected, no tool.** Each wake gets a compact envelope: active goals, ships with pending ETAs, contract deadlines within horizon, recent failures to avoid repeating, rate budget. Not stored — projected from state.

**2. Memory tools — agent-initiated, persisted (`data/memory.json`, atomic writes, alongside the activity log):**

```
remember(content, tags, kind, importance)   # kind: fact | observation | strategy | todo
recall(query | tags)                        # returns matching notes, newest/most-important first
forget(noteId | tag)                        # e.g. drop stale price observations
set_goal / complete_goal                    # durable objectives with deadline + status
```

Design rules that keep memory useful instead of a swamp:

- **Typed notes, not freeform blobs.** A price observation is `{good, waypoint, price, spread, seenAt}` — queryable, and consolidation can act on it. Freeform text is allowed for strategy notes but never mixed into structured queries.
- **Consolidation at loop boundaries.** Old observations get compacted ("seen FUEL at 3 waypoints over 5 loops" → one fact); superseded notes get archived. Otherwise recall degrades into noise and every note competes for the context window.
- **Memory is harness-local.** The SpaceTraders API has no storage endpoint — memory tools are harness-internal like `wait_until`, and never burn rate budget.
- **Activity log ≠ memory.** The log is the raw append-only record (what happened, every tool call). Memory is the *distilled* layer (what was learned). Log answers "what did it do"; memory answers "what does it know".

### 6.3 Summaries — user-facing, generated from the event log

The agent's memory is compact and machine-shaped; users want narrative and numbers. Summaries are **compactions of the event log at loop boundaries** — zero extra API cost, no agent involvement:

| Level | Content | Panel use |
|---|---|---|
| **Loop summary** | 1–3 sentences per wake: "Woke for SHIP-1 arrival at X1-OE-A01. Sold 60 IRON_ORE (+9,300 cr), bought 80 FUEL, queued extraction." | Interleaved in the activity feed between raw events |
| **Session digest** | Every N minutes or on request: P&L, cargo movement, contracts progressed, notable decisions, failures with guard rejections | The "what is my agent doing" view |
| **Current plan** | The THINK output (chosen tools + rationale), stored in the checkpoint | "Why did it do that" widget — live intent |

- **Failure summaries matter most.** When the agent stalls (all guards failing, budget exhausted, ship stuck), the summary must say so plainly — "SHIP-2 idle 15 min: no market at current waypoint sells its cargo; agent requested navigation". An unexplained silent fleet is what makes users stop trusting the panel.
- Layering: `event log (raw) → loop summaries (narrative) → session digests (analytics)` — each level compacts the one below, all read-only panel endpoints (`/api/activity`, `/api/summaries`, `/api/plan`).

### 6.4 Where it lives

- Loop phases live in `src/agent/` (scheduler, loop, checkpointing); memory store + consolidation in `src/state/` (JSON files under `data/` with atomic writes); summary generation subscribes to the event bus like any panel consumer — it is *not* agent code.
- New panel endpoints: `GET /api/activity` (raw log, paginated), `GET /api/summaries` (loop + session), `GET /api/plan` (current intent from checkpoint).
- New harness-internal tools registered like any other: `remember`, `recall`, `forget`, `set_goal`, `complete_goal` — same registry, same test requirements (guards trivial: budget-free, no API).

---

## 7. User Interface

The panel is read-only data plus a small set of user commands (user commands are already a wakeup source in §6.1).

### 7.1 Layout

```
┌───────────────────────────────────────────────────────────────┐
│ ◉ Live   ⛭ SpaceTradingHarness     [rate gauge ▓▓▓░ 1.4/2]  ⚑3 │  ← always-visible topbar
├──────────┬────────────────────────────────────────────────────┤
│ Dashboard│                                                    │
│ Fleet    │              page content                          │
│ Map      │         (SSE-patched, never polls)                 │
│ Markets  │                                                    │
│ Contracts│                                                    │
│ Activity │                                                    │
│ Memory   │                                                    │
│ Agent    │                                                    │
│ Settings │                                                    │
└──────────┴────────────────────────────────────────────────────┘
```

### 7.2 Pages

1. **Dashboard** — the "is everything fine" glance: credits + 24h delta sparkline, fleet size, agent rank, reset countdown, announcements; rate budget gauge (from `X-Req-RateLimit-*` events, red as it drains); current plan widget (`/api/plan`); alert cards (stalled ships, guard-failure spikes, contract deadlines, low fuel); latest session digest.
2. **Fleet** — cards/table per ship (nav status badge, location, fuel %, cargo fill, cooldown ring, current task); ship drawer with full state (modules, mounts, crew), per-ship event timeline, next scheduled wakeup, per-ship pause/resume.
3. **Map** — systems with jump-gate links, waypoints with traits, ship positions + in-flight routes with ETA arcs; selection syncs with fleet drawer. Largest effort; ships last.
4. **Markets** — trade-good table with price/volume/sparkline from harness-local history; arbitrage hints net of fuel; supply-chain browser.
5. **Contracts** — board with per-good progress bars, deadline countdowns with color shift, payout split, status pipeline (offered → accepted → fulfilled/expired) + history.
6. **Activity** — the audit centerpiece: raw tool calls interleaved with loop summaries (§6.3), filterable by ship/tool/outcome; entries expand to args, result, guards evaluated, duration, requests spent; timeline scrubber.
7. **Memory browser** — what the agent knows: notes table (kind, tags, importance, age) with search (the same store `recall` queries); goals with status/deadline — user can add/edit goals (feeds working memory next wake); consolidation history.
8. **Agent** — control surface: pause/resume (global + per-ship), wakeup schedule view, directive box (freeform nudge injected into next wake's working memory). The agent is **fully autonomous** — there is no approval queue; every registered tool (including purchases and scrap) executes at the LLM's discretion under guard + policy checks. Observability (activity log, plans, summaries) replaces human gating.
9. **Settings** — agent token (write-only, never displayed back), account token for registration, TTL/cache policies, LLM config, theme.

### 7.3 Cross-cutting rules

- **Every number is traceable.** Click any credit delta, cargo change, or status flip → jump to the exact activity entry that caused it. This is what makes an autonomous agent auditable instead of opaque.
- **Live but honest.** All updates via SSE; on disconnect show a stale indicator + last-event timestamp rather than silently freezing.
- **Progressive disclosure.** Dashboard summarizes → drawer drills → activity explains. No page shows more than one screen of primary info.
- **Reads are free, writes are deliberate.** The only mutating controls (Agent page: pause/resume/wake/directive) are visually distinct, so observation is never confused with intervention.

MVP cut: topbar + Dashboard + Fleet + Activity + pause/resume. Everything else is additive — widgets subscribe to existing endpoints with no core changes (§5.6).
