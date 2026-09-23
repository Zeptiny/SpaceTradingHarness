# Get Ship Nav

- **Operation ID:** `get-ship-nav`
- **Endpoint:** `GET /my/ships/{shipSymbol}/nav`
- **Tag:** Fleet
- **Auth:** Agent token required

Get the current nav status of a ship.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — The current nav status of the ship.

**Content-Type:** `application/json`

- `data` **[ShipNav](../schemas/ShipNav.md)** *(required)*

