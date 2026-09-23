# Get Ship Cargo

- **Operation ID:** `get-my-ship-cargo`
- **Endpoint:** `GET /my/ships/{shipSymbol}/cargo`
- **Tag:** Fleet
- **Auth:** Agent token required

Retrieve the cargo of a ship under your agent's ownership.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully fetched ship's cargo.

**Content-Type:** `application/json`

- `data` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*

