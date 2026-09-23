# Install Ship Module

- **Operation ID:** `install-ship-module`
- **Endpoint:** `POST /my/ships/{shipSymbol}/modules/install`
- **Tag:** Fleet
- **Auth:** Agent token required

Install a module on a ship. The module must be in your cargo.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `symbol` **string** *(required)* — The symbol of the module to install.

### Responses

#### 201 Created — Successfully installed the module on the ship.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `modules` **[ShipModule](../schemas/ShipModule.md)[]** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `transaction` **[ShipModificationTransaction](../schemas/ShipModificationTransaction.md)** *(required)*

