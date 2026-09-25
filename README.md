# SpaceTradingHarness

An autonomous agent harness for the [SpaceTraders API](https://spacetraders.io) — an open-universe HTTP game API where agents control a fleet of ships to trade, mine, and explore. The LLM decision core is **fully autonomous**: it plans and acts via tools with local guard checks — no human approval step.

## Contents

- [`openapi.json`](./openapi.json) — vendored OpenAPI 3.0.1 spec (API v2.3.0), fetched from `https://api.spacetraders.io/v2/documentation/json`
- [`docs/openapi/`](./docs/openapi/README.md) — full API reference in markdown: 64 routes across 8 tag groups + 78 schema definitions, one file each
- [`HARNESS.md`](./HARNESS.md) — practical notes for building the agent tool surface: auth, rate limits, cooldowns, nav state machine, tool→route mapping
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — harness design: tool surface, monitoring web panel, agent loop with persistent memory + user-facing summaries, layering/modularity/codegen rules that prevent duplication
- [`src/`](./src) — harness implementation (TypeScript): transport → client → guards/tools → agent loop → panel
- [`scripts/generate_openapi_docs.py`](./scripts/generate_openapi_docs.py) — regenerates `docs/openapi/` from `openapi.json`
- [`scripts/generate_api_types.py`](./scripts/generate_api_types.py) — generates `src/generated/` (route table + 78 schema types + 64 response types)
- [`scripts/check_architecture.mjs`](./scripts/check_architecture.mjs) — enforces import-boundary rules from ARCHITECTURE.md §5.7

## Running the harness

```sh
npm install
npm run codegen       # regenerate src/generated from openapi.json
npm run typecheck
npm run check:arch    # import-boundary enforcement
npm test              # unit tests (no .env needed for the pure ones)
npm run smoke         # API + LLM round-trip test (read-only)
npm start             # harness + panel at http://127.0.0.1:8787
npm run demo          # panel only, on fixture data + simulated wakes — no token, no API/LLM calls (http://127.0.0.1:8790)
```

Requires `.env` with `API_TOKEN`, `OPENAI_API_URL`, `OPENAI_API_KEY`, `LLM_MODEL`. Start from the template: `cp .env.example .env`.

Server resets: at startup the harness reads the server's reset date and your agent symbol and keeps them in `data/universe.json`. When either changes (a server reset, or a token for a different agent), everything else in `data/` (prices, atlas, routines, earnings, notes, logs) describes a universe that no longer exists, so it is moved to `data/archive/<old reset date>-<agent>-<time>/` before anything loads. Copy a file back from there if you want to keep it.

Env knobs (optional): `AGENT_POLICY=readonly` (block all mutating tools), `AGENT_MAX_ACTIONS_PER_WAKE` (floor, default 32; the budget is max of this and `AGENT_ACTIONS_PER_SHIP` × fleet size, default 6), `AGENT_CREDIT_RESERVE` (credits ship purchases may not dip below, default 25000), `AGENT_AUTO_SCAN_REQUESTS` (API requests spent at each wake start reading markets/shipyards where ships sit, default 8, 0 disables), `AGENT_COLLECTOR_INTERVAL_MS` / `AGENT_COLLECTOR_REQUESTS` (background collector while the agent sleeps: maps the fleet's systems, refreshes prices where ships are parked, reads the jump gate and scouts connected systems; defaults 120000 ms / 6 requests, either 0 disables), `AGENT_MAX_ROUNDS_PER_WAKE` (floor; the round cap is max of this and `AGENT_ROUNDS_PER_SHIP` × fleet size, default 4), `AGENT_LLM_RETRIES` (times a timed-out or 5xx LLM call is retried inside the same wake, default 3), `AGENT_AUTO_REFUEL` (top up before each departure when fuel here is within `AGENT_AUTO_REFUEL_MAX_PREMIUM` of the cheapest seen in the system, default on / 0.15; always refuels when the leg needs it; `navigate` takes `refuel:false` to skip), `AGENT_READ_MARKET_ON_ARRIVAL` (price the market, and shipyard if stale, when a ship lands; default on), `AGENT_AUTO_CONTRACTS` (fulfil a contract once its last delivery lands and negotiate the next one; default on), `AGENT_ROUTINE_MIN_CREDITS` (trade routines never buy below this balance, default 5000), `AGENT_MAX_CONCURRENT_TOOLS`, `AGENT_FALLBACK_WAKE_MS`, `AGENT_MIN_WAKE_GAP_MS`, `PANEL_PORT`, `PANEL_HOST` (default 127.0.0.1), `PANEL_ALLOWED_HOSTS` (extra hostnames the panel accepts, comma-separated or `*`), `TRANSPORT_MIN_INTERVAL_MS`, `TRANSPORT_MAX_429_RETRIES` (how many times a rate-limited request is waited out and resent, default 20), `TRANSPORT_TIMEOUT_MS`, `LLM_TIMEOUT_MS`, `LLM_ECHO_REASONING` (default on; sends the model's native reasoning back on its earlier assistant messages, set 0 if the endpoint rejects it).

## Panel

`http://127.0.0.1:8787` — localhost-only by default (Host/Origin validated). To open it from another machine, e.g. a homeserver, set `PANEL_HOST=0.0.0.0` and `PANEL_ALLOWED_HOSTS` to the IP or hostname you browse to. There is no login, so only do this on a trusted network. Plain HTML/CSS/JS in `src/panel/public/`, no build step; live over one SSE stream. An always-visible status strip shows whether the agent is executing (wake/round), standing by (next wake countdown) or paused, plus credits, API budget and LLM token use.

- **Overview** — fleet/contract/wake/LLM tiles, credits chart, the agent's current thought, alerts (low fuel, deadlines, failing wakes, LLM errors), recent wakes.
- **Fleet** — per-ship route progress + ETA, fuel/cargo, cooldown, inventory, last action.
- **Activity** — every wake as a transcript: the agent's reasoning between rounds, each tool call (guards, args, result, real request count), and its end-of-wake summary with duration/requests/tokens/credit delta.
- **Map** — pan/zoom system map: waypoint types, markets, orbitals, parked ships and in-transit ships moving along their routes.
- **Markets** — trade opportunities (best buy→sell pair per good, with data age) and a market browser with supply levels and price trends.
- **Contracts** — active / offered / closed board with delivery progress and live deadlines.
- **Memory** — goals (add/complete) and the agent's notes.
- **Agent** — pause/resume/wake, directive, scheduled wakeups, runtime config + LLM usage, tool catalog.

Run `npm run demo` to work on the panel without a token.

## Regenerating docs

```sh
python3 scripts/generate_openapi_docs.py
```

## Refreshing the spec

```sh
curl -s https://api.spacetraders.io/v2/documentation/json -o openapi.json
python3 scripts/generate_api_types.py
python3 scripts/generate_openapi_docs.py
```
