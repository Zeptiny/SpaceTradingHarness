# Remove Mount

- **Operation ID:** `remove-mount`
- **Endpoint:** `POST /my/ships/{shipSymbol}/mounts/remove`
- **Tag:** Fleet
- **Auth:** Agent token required

Remove a mount from a ship.

The ship must be docked in a waypoint that has the `Shipyard` trait, and must have the desired mount that it wish to remove installed.

A removal fee will be deduced from the agent by the Shipyard.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

**Remove Mount Request**

- `symbol` **string** *(required)* — The symbol of the mount to remove.

### Responses

#### 201 Created — Successfully removed the mount.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `mounts` **[ShipMount](../schemas/ShipMount.md)[]** *(required)* — List of installed mounts after the removal of the selected mount.
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `transaction` **[ShipModificationTransaction](../schemas/ShipModificationTransaction.md)** *(required)*

