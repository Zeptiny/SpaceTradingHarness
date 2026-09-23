# Scan Waypoints

- **Operation ID:** `create-ship-waypoint-scan`
- **Endpoint:** `POST /my/ships/{shipSymbol}/scan/waypoints`
- **Tag:** Fleet
- **Auth:** Agent token required

Scan for nearby waypoints, retrieving detailed information on each waypoint in range. Scanning uncharted waypoints will allow you to ignore their uncharted state and will list the waypoints' traits.

Requires a ship to have the `Sensor Array` mount installed to use.

The ship will enter a cooldown after using this function, during which it cannot execute certain actions.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Successfully scanned for nearby waypoints.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `waypoints` **[ScannedWaypoint](../schemas/ScannedWaypoint.md)[]** *(required)* — List of scanned waypoints.

