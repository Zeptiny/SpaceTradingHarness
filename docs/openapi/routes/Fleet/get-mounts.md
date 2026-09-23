# Get Mounts

- **Operation ID:** `get-mounts`
- **Endpoint:** `GET /my/ships/{shipSymbol}/mounts`
- **Tag:** Fleet
- **Auth:** Agent token required

Get the mounts installed on a ship.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully retrieved ship mounts.

**Content-Type:** `application/json`

- `data` **[ShipMount](../schemas/ShipMount.md)[]** *(required)*

