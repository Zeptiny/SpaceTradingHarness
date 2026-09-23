# Scrap Ship

- **Operation ID:** `scrap-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/scrap`
- **Tag:** Fleet
- **Auth:** Agent token required

Scrap a ship, removing it from the game and receiving a portion of the ship's value back in credits. The ship must be docked in a waypoint that has the `Shipyard` trait to be scrapped.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Ship scrapped successfully.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `transaction` **[ScrapTransaction](../schemas/ScrapTransaction.md)** *(required)*

