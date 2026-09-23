# Navigate Ship

- **Operation ID:** `navigate-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/navigate`
- **Tag:** Fleet
- **Auth:** Agent token required

Navigate to a target destination. The ship must be in orbit to use this function. The destination waypoint must be within the same system as the ship's current location. Navigating will consume the necessary fuel from the ship's manifest based on the distance to the target waypoint.

The returned response will detail the route information including the expected time of arrival. Most ship actions are unavailable until the ship has arrived at it's destination.

To travel between systems, see the ship's Warp or Jump actions.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `waypointSymbol` **string** *(required)* — The symbol of the waypoint to navigate/warp to.

### Responses

#### 200 OK — The successful transit information including the route details and changes to ship fuel. The route includes the expected time of arrival.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*
  - `fuel` **[ShipFuel](../schemas/ShipFuel.md)** *(required)*
  - `events` **[ShipConditionEvent](../schemas/ShipConditionEvent.md)[]** *(required)*

