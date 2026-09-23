# Get Shipyard

- **Operation ID:** `get-shipyard`
- **Endpoint:** `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/shipyard`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Get the shipyard for a waypoint. Requires a waypoint that has the `Shipyard` trait to use. Send a ship to the waypoint to access data on ships that are currently available for purchase and recent transactions.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string | The system symbol |
| `waypointSymbol` | path | yes | string | The waypoint symbol |

### Responses

#### 200 OK — Successfully fetched the shipyard.

**Content-Type:** `application/json`

- `data` **[Shipyard](../schemas/Shipyard.md)** *(required)*

