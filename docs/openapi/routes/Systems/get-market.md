# Get Market

- **Operation ID:** `get-market`
- **Endpoint:** `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/market`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Retrieve imports, exports and exchange data from a marketplace. Requires a waypoint that has the `Marketplace` trait to use.

Send a ship to the waypoint to access trade good prices and recent transactions. Refer to the [Market Overview page](https://docs.spacetraders.io/game-concepts/markets) to gain better a understanding of the market in the game.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string | The system symbol |
| `waypointSymbol` | path | yes | string | The waypoint symbol |

### Responses

#### 200 OK — Successfully fetched the market.

**Content-Type:** `application/json`

- `data` **[Market](../schemas/Market.md)** *(required)*

