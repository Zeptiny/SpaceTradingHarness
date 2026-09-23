# List Ships

- **Operation ID:** `get-my-ships`
- **Endpoint:** `GET /my/ships`
- **Tag:** Fleet
- **Auth:** Agent token required

Return a paginated list of all of ships under your agent's ownership.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |

### Responses

#### 200 OK — Successfully listed ships.

**Content-Type:** `application/json`

- `data` **[Ship](../schemas/Ship.md)[]** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

