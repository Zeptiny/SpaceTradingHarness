# Orbit Ship

- **Operation ID:** `orbit-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/orbit`
- **Tag:** Fleet
- **Auth:** Agent token required

Attempt to move your ship into orbit at its current location. The request will only succeed if your ship is capable of moving into orbit at the time of the request.

Orbiting ships are able to do actions that require the ship to be above surface such as navigating or extracting, but cannot access elements in their current waypoint, such as the market or a shipyard.

The endpoint is idempotent - successive calls will succeed even if the ship is already in orbit.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string |  |

### Responses

#### 200 OK — The ship has successfully moved into orbit at its current location.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*

