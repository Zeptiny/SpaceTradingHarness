# Jump Ship

- **Operation ID:** `jump-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/jump`
- **Tag:** Fleet
- **Auth:** Agent token required

Jump your ship instantly to a target connected waypoint. The ship must be in orbit to execute a jump.

A unit of antimatter is purchased and consumed from the market when jumping. The price of antimatter is determined by the market and is subject to change. A ship can only jump to connected waypoints

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `waypointSymbol` **string** *(required)* — The symbol of the waypoint to jump to. The destination must be a connected waypoint.

### Responses

#### 200 OK — Jump successful.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `transaction` **[MarketTransaction](../schemas/MarketTransaction.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*

