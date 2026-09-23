# Scan Systems

- **Operation ID:** `create-ship-system-scan`
- **Endpoint:** `POST /my/ships/{shipSymbol}/scan/systems`
- **Tag:** Fleet
- **Auth:** Agent token required

Scan for nearby systems, retrieving information on the systems' distance from the ship and their waypoints. Requires a ship to have the `Sensor Array` mount installed to use.

The ship will enter a cooldown after using this function, during which it cannot execute certain actions.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Successfully scanned for nearby systems.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `systems` **[ScannedSystem](../schemas/ScannedSystem.md)[]** *(required)* — List of scanned systems.

