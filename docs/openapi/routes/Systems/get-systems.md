# List Systems

- **Operation ID:** `get-systems`
- **Endpoint:** `GET /systems`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Return a paginated list of all systems.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |

### Responses

#### 200 OK — Successfully listed systems.

**Content-Type:** `application/json`

- `data` **[System](../schemas/System.md)[]** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

