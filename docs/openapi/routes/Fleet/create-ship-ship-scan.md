# Scan Ships

- **Operation ID:** `create-ship-ship-scan`
- **Endpoint:** `POST /my/ships/{shipSymbol}/scan/ships`
- **Tag:** Fleet
- **Auth:** Agent token required

Scan for nearby ships, retrieving information for all ships in range.

Requires a ship to have the `Sensor Array` mount installed to use.

The ship will enter a cooldown after using this function, during which it cannot execute certain actions.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Successfully scanned for nearby ships.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `ships` **[ScannedShip](../schemas/ScannedShip.md)[]** *(required)* — List of scanned ships.

