# Remove Ship Module

- **Operation ID:** `remove-ship-module`
- **Endpoint:** `POST /my/ships/{shipSymbol}/modules/remove`
- **Tag:** Fleet
- **Auth:** Agent token required

Remove a module from a ship. The module will be placed in cargo.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `symbol` **string** *(required)* — The symbol of the module to remove.

### Responses

#### 201 Created — Successfully removed the module from the ship.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `modules` **[ShipModule](../schemas/ShipModule.md)[]** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `transaction` **[ShipModificationTransaction](../schemas/ShipModificationTransaction.md)** *(required)*

