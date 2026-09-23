# Repair Ship

- **Operation ID:** `repair-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/repair`
- **Tag:** Fleet
- **Auth:** Agent token required

Repair a ship, restoring the ship to maximum condition. The ship must be docked at a waypoint that has the `Shipyard` trait in order to use this function. To preview the cost of repairing the ship, use the Get action.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Ship repaired successfully.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `ship` **[Ship](../schemas/Ship.md)** *(required)*
  - `transaction` **[RepairTransaction](../schemas/RepairTransaction.md)** *(required)*

