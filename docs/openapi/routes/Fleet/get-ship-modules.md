# Get Ship Modules

- **Operation ID:** `get-ship-modules`
- **Endpoint:** `GET /my/ships/{shipSymbol}/modules`
- **Tag:** Fleet
- **Auth:** Agent token required

Get the modules installed on a ship.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully retrieved ship modules.

**Content-Type:** `application/json`

- `data` **[ShipModule](../schemas/ShipModule.md)[]** *(required)*

