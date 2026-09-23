# Get Construction Site

- **Operation ID:** `get-construction`
- **Endpoint:** `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/construction`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Get construction details for a waypoint. Requires a waypoint with a property of `isUnderConstruction` to be true.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string | The system symbol |
| `waypointSymbol` | path | yes | string | The waypoint symbol |

### Responses

#### 200 OK — Successfully fetched construction site.

**Content-Type:** `application/json`

- `data` **[Construction](../schemas/Construction.md)** *(required)*

