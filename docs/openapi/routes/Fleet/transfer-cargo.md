# Transfer Cargo

- **Operation ID:** `transfer-cargo`
- **Endpoint:** `POST /my/ships/{shipSymbol}/transfer`
- **Tag:** Fleet
- **Auth:** Agent token required

Transfer cargo between ships.

The receiving ship must be in the same waypoint as the transferring ship, and it must able to hold the additional cargo after the transfer is complete. Both ships also must be in the same state, either both are docked or both are orbiting.

The response body's cargo shows the cargo of the transferring ship after the transfer is complete.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

**Transfer Cargo Request**

- `tradeSymbol` **[TradeSymbol](../schemas/TradeSymbol.md)** *(required)*
- `units` **integer** *(required)* — Amount of units to transfer.
- `shipSymbol` **string** *(required)* — The symbol of the ship to transfer to.

### Responses

#### 200 OK — Cargo transferred successfully.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `targetCargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*

