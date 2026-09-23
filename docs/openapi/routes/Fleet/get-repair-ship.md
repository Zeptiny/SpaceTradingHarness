# Get Repair Ship

- **Operation ID:** `get-repair-ship`
- **Endpoint:** `GET /my/ships/{shipSymbol}/repair`
- **Tag:** Fleet
- **Auth:** Agent token required

Get the cost of repairing a ship. Requires the ship to be docked at a waypoint that has the `Shipyard` trait.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully retrieved the cost of repairing a ship.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `transaction` **[RepairTransaction](../schemas/RepairTransaction.md)** *(required)*

