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
npm run smoke         # API + LLM round-trip test (read-only)
npm start             # harness + panel at http://127.0.0.1:8787
```

Requires `.env` with `API_TOKEN`, `OPENAI_API_URL`, `OPENAI_API_KEY`, `LLM_MODEL`. Start from the template: `cp .env.example .env`.

Env knobs (optional): `AGENT_POLICY=readonly` (block all mutating tools), `AGENT_MAX_ACTIONS_PER_WAKE` (floor; the budget is max of this and `AGENT_ACTIONS_PER_SHIP` × fleet size, default 6), `AGENT_CREDIT_RESERVE` (credits ship purchases may not dip below, default 25000), `AGENT_AUTO_SCAN_REQUESTS` (API requests spent at each wake start reading markets/shipyards where ships sit, default 8, 0 disables), `AGENT_MAX_ROUNDS_PER_WAKE`, `AGENT_MAX_CONCURRENT_TOOLS`, `AGENT_WAKE_TIMEOUT_MS`, `AGENT_FALLBACK_WAKE_MS`, `AGENT_MIN_WAKE_GAP_MS`, `PANEL_PORT`, `PANEL_HOST` (default 127.0.0.1), `PANEL_ALLOWED_HOSTS` (extra hostnames the panel accepts, comma-separated or `*`), `TRANSPORT_MIN_INTERVAL_MS`, `TRANSPORT_TIMEOUT_MS`, `LLM_TIMEOUT_MS`.

## Panel

`http://127.0.0.1:8787` — localhost-only by default (Host/Origin validated). To open it from another machine, e.g. a homeserver, set `PANEL_HOST=0.0.0.0` and `PANEL_ALLOWED_HOSTS` to the IP or hostname you browse to. There is no login, so only do this on a trusted network. Pages: Dashboard, Fleet, Map (per-system waypoint plot with ship positions), Markets (price history), Contracts (progress board), Activity (auditable tool-call log), Summaries (loop digests), Agent (pause/resume/wake/directive + tool catalog), Memory (agent notes + goals), Settings.

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
