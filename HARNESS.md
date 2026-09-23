# SpaceTraders API — Harness Notes

Practical notes for building an agent harness on top of the SpaceTraders API. Full reference lives in [`docs/openapi/`](./openapi/README.md); design and architecture in [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).

## API Facts

- Base URL: `https://api.spacetraders.io/v2`
- Auth: `Authorization: Bearer <agentToken>` header on all agent endpoints
- Spec source: `https://api.spacetraders.io/v2/documentation/json` (also vendored at repo root as `openapi.json`)
- 64 operations across 8 tag groups; 78 component schemas
- Global rate limit: ~2 requests/second (409/429 errors on violation). Server sends `X-Req-RateLimit-*` headers.
- Errors: JSON body `{ "error": { "message", "code", "data" } }`; code list at `GET /error-codes`

## Tool Surface (by capability)

### Account bootstrap
| Operation | Call | Notes |
|---|---|---|
| Server status | `GET /` | No auth needed; reset date, announcements, leaderboards |
| Register agent | `POST /register` | Needs AccountToken from dashboard; returns agent token + starting contract + 2 ships + 175k credits |
| My agent | `GET /my/agent` | Credits, headquarters, ship count |
| Agent events | `GET /my/agent/events` | Poll for credit-changing events |
| My account | `GET /my/account` | Account symbol + agents list |

### Contracts
| Operation | Call |
|---|---|
| List contracts | `GET /my/contracts` |
| Get contract | `GET /my/contracts/{contractId}` |
| Accept | `POST /my/contracts/{contractId}/accept` |
| Deliver cargo | `POST /my/contracts/{contractId}/deliver` |
| Fulfill | `POST /my/contracts/{contractId}/fulfill` |

### Fleet control (37 ops — the core loop)
| Operation | Call |
|---|---|
| List/purchase ships | `GET/POST /my/ships` |
| Ship status | `GET /my/ships/{shipSymbol}` (full state incl. nav, cargo, fuel, cooldown) |
| Navigate / warp / jump | `POST /my/ships/{shipSymbol}/navigate` / `warp` / `jump` |
| Orbit / dock | `POST /my/ships/{shipSymbol}/orbit` / `dock` |
| Refuel | `POST /my/ships/{shipSymbol}/refuel` |
| Extract / siphon | `POST /my/ships/{shipSymbol}/extract` / `siphon` (+ `/extract/survey`, `/survey`) |
| Buy/sell/transfer cargo | `POST /my/ships/{shipSymbol}/purchase` / `sell` / `transfer` / `jettison` |
| Scans | `POST /my/ships/{shipSymbol}/scan/{systems,waypoints,ships}` |
| Modules/mounts | `GET .../modules`, `POST .../modules/install`, `.../remove`, same for `mounts` |
| Nav status | `GET/PATCH /my/ships/{shipSymbol}/nav` (PATCH sets flight mode) |
| Negotiate contracts | `POST /my/ships/{shipSymbol}/negotiate/contract` |
| Refine | `POST /my/ships/{shipSymbol}/refine` |
| Scrap/repair | `GET/POST /my/ships/{shipSymbol}/scrap` / `repair` |
| Chart | `POST /my/ships/{shipSymbol}/chart` |

### Markets & systems data
| Operation | Call |
|---|---|
| Systems/waypoints | `GET /systems`, `GET /systems/{systemSymbol}`, `GET /systems/{systemSymbol}/waypoints[/{waypointSymbol}]` |
| Market data | `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/market` |
| Shipyard data | `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/shipyard` |
| Jump gate | `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/jump-gate` |
| Construction | `GET/POST .../construction[/supply]` |
| Supply chain | `GET /market/supply-chain` |
| Factions | `GET /factions`, `GET /factions/{factionSymbol}`, `GET /my/factions` |
| Public agents | `GET /agents`, `GET /agents/{agentSymbol}` |

### Real-time events
- `GET /my/socket.io` — returns a signed websocket URL; SpaceTraders pushes ship/navigation events over Socket.IO instead of you polling.

## Harness Design Notes

1. **Cooldowns gate actions.** Every mutating ship action returns a `Cooldown` (e.g. `extract` → 60-90s per ship). The harness should track per-ship cooldown expiry and refuse/queue actions rather than hitting 409s.
2. **Nav state machine.** Ships must be in specific nav states per action: `DOCKED` to trade/refuel/repair, `IN_ORBIT` to extract/scan, `IN_TRANSIT` blocks most actions. Enforce preconditions in tool layer.
3. **Rate limit is the bottleneck.** All agent tools funnel through ~2 req/s. The agent always fetches live state (never cached reads); a write-only state mirror serves the web panel, and the socket provides event pushes instead of polling.
4. **Polling long actions.** `navigate` returns a `nav` with `route.arrival`; the harness should compute arrival time and schedule a wakeup rather than busy-polling.
5. **Symbols are stable identifiers.** Ship symbols are `{AGENT}-{HEX}`, waypoints `{SYSTEM}-{X}-{Y}` (e.g. `X1-OE-01A`), contracts UUIDs. Use them as tool parameter keys.
6. **Static vs dynamic data.** Systems, waypoints, factions are static per reset; markets, shipyards, construction change constantly. The harness makes no freshness/distinction tradeoffs for the agent — every read is live from the API, paced by the rate limiter.
7. **Registration is one-time per reset.** `/register` requires an AccountToken (from the website dashboard), not an agent token.

## Example Tool → Route Mapping

A minimal trading agent needs:

```
get_status          -> GET /
get_my_agent        -> GET /my/agent
get_systems         -> GET /systems?limit=&page=
get_waypoints       -> GET /systems/{system}/waypoints?traits=MARKETPLACE
get_market          -> GET /systems/{s}/waypoints/{w}/market
get_my_ships        -> GET /my/ships
navigate_ship       -> POST /my/ships/{ship}/navigate
dock_ship           -> POST /my/ships/{ship}/dock
orbit_ship          -> POST /my/ships/{ship}/orbit
purchase_cargo      -> POST /my/ships/{ship}/purchase
sell_cargo          -> POST /my/ships/{ship}/sell
refuel_ship         -> POST /my/ships/{ship}/refuel
get_contracts       -> GET /my/contracts
accept_contract     -> POST /my/contracts/{id}/accept
deliver_cargo       -> POST /my/contracts/{id}/deliver
fulfill_contract    -> POST /my/contracts/{id}/fulfill
```
