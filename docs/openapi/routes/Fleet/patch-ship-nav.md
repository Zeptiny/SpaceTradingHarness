# Patch Ship Nav

- **Operation ID:** `patch-ship-nav`
- **Endpoint:** `PATCH /my/ships/{shipSymbol}/nav`
- **Tag:** Fleet
- **Auth:** Agent token required

Update the nav configuration of a ship.

Currently only supports configuring the Flight Mode of the ship, which affects its speed and fuel consumption.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields optional)*

- `flightMode` **[ShipNavFlightMode](../schemas/ShipNavFlightMode.md)**

### Responses

#### 200 OK — Success response for updating the nav configuration of a ship.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*
  - `fuel` **[ShipFuel](../schemas/ShipFuel.md)** *(required)*
  - `events` **[ShipConditionEvent](../schemas/ShipConditionEvent.md)[]** *(required)*

