# List Contracts

- **Operation ID:** `get-contracts`
- **Endpoint:** `GET /my/contracts`
- **Tag:** Contracts
- **Auth:** Agent token required

Return a paginated list of all your contracts.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |

### Responses

#### 200 OK — Successfully listed contracts.

**Content-Type:** `application/json`

- `data` **[Contract](../schemas/Contract.md)[]** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

