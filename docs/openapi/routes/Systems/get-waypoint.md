# Get Waypoint

- **Operation ID:** `get-waypoint`
- **Endpoint:** `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

View the details of a waypoint.

If the waypoint is uncharted, it will return the 'Uncharted' trait instead of its actual traits.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string | The system symbol |
| `waypointSymbol` | path | yes | string | The waypoint symbol |

### Responses

#### 200 OK — Successfully fetched waypoint details.

**Content-Type:** `application/json`

- `data` **[Waypoint](../schemas/Waypoint.md)** *(required)*

