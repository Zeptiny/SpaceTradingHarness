# Get Scrap Ship

- **Operation ID:** `get-scrap-ship`
- **Endpoint:** `GET /my/ships/{shipSymbol}/scrap`
- **Tag:** Fleet
- **Auth:** Agent token required

Get the value of scrapping a ship. Requires the ship to be docked at a waypoint that has the `Shipyard` trait.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully retrieved the amount of value that will be returned when scrapping a ship.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `transaction` **[ScrapTransaction](../schemas/ScrapTransaction.md)** *(required)*

