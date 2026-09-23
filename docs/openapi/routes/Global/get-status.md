# Server status

- **Operation ID:** `get-status`
- **Endpoint:** `GET /`
- **Tag:** Global
- **Auth:** Anonymous or agent token

Return the status of the game server.
This also includes a few global elements, such as announcements, server reset dates and leaderboards.

### Responses

#### 200 OK — Fetched status successfully.

**Content-Type:** `application/json`

- `status` **string** *(required)* — The current status of the game server.
- `version` **string** *(required)* — The current version of the API.
- `resetDate` **string** *(required)* — The date when the game server was last reset.
- `description` **string** *(required)*
- `stats` **object** *(required)*
  - `accounts` **integer** — Total number of accounts registered on the game server.
  - `agents` **integer** *(required)* — Number of registered agents in the game.
  - `ships` **integer** *(required)* — Total number of ships in the game.
  - `systems` **integer** *(required)* — Total number of systems in the game.
  - `waypoints` **integer** *(required)* — Total number of waypoints in the game.
- `health` **object** *(required)*
  - `lastMarketUpdate` **string** — The date/time when the market was last updated.
- `leaderboards` **object** *(required)*
  - `mostCredits` **object[]** *(required)* — Top agents with the most credits.
    - `agentSymbol` **string** *(required)* — Symbol of the agent.
    - `credits` **integer (int64)** *(required)* — Amount of credits.
  - `mostSubmittedCharts` **object[]** *(required)* — Top agents with the most charted submitted.
    - `agentSymbol` **string** *(required)* — Symbol of the agent.
    - `chartCount` **integer** *(required)* — Amount of charts done by the agent.
- `serverResets` **object** *(required)*
  - `next` **string** *(required)* — The date and time when the game server will reset.
  - `frequency` **string** *(required)* — How often we intend to reset the game server.
- `announcements` **object[]** *(required)*
  - `title` **string** *(required)*
  - `body` **string** *(required)*
- `links` **object[]** *(required)*
  - `name` **string** *(required)*
  - `url` **string (uri)** *(required)*

