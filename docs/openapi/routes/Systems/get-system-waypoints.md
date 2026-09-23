# List Waypoints in System

- **Operation ID:** `get-system-waypoints`
- **Endpoint:** `GET /systems/{systemSymbol}/waypoints`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Return a paginated list of all of the waypoints for a given system.

If a waypoint is uncharted, it will return the `Uncharted` trait instead of its actual traits.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |
| `type` | query | no | allOf composite | Filter waypoints by type. |
| `traits` | query | no | anyOf composite | Filter waypoints by one or more traits. |
| `systemSymbol` | path | yes | string |  |

### Responses

#### 200 OK — Successfully listed waypoints.

**Content-Type:** `application/json`

- `data` **[Waypoint](../schemas/Waypoint.md)[]** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

