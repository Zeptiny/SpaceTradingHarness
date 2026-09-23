# Get Jump Gate

- **Operation ID:** `get-jump-gate`
- **Endpoint:** `GET /systems/{systemSymbol}/waypoints/{waypointSymbol}/jump-gate`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Get jump gate details for a waypoint. Requires a waypoint of type `JUMP_GATE` to use.

Waypoints connected to this jump gate can be found by querying the waypoints in the system.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string | The system symbol |
| `waypointSymbol` | path | yes | string | The waypoint symbol |

### Responses

#### 200 OK — Jump gate details retrieved successfully.

**Content-Type:** `application/json`

- `data` **[JumpGate](../schemas/JumpGate.md)** *(required)*

