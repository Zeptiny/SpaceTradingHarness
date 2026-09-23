# Get Ship

- **Operation ID:** `get-my-ship`
- **Endpoint:** `GET /my/ships/{shipSymbol}`
- **Tag:** Fleet
- **Auth:** Agent token required

Retrieve the details of a ship under your agent's ownership.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully fetched ship.

**Content-Type:** `application/json`

- `data` **[Ship](../schemas/Ship.md)** *(required)*

