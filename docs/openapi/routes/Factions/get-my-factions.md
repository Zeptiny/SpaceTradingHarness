# Get My Factions

- **Operation ID:** `get-my-factions`
- **Endpoint:** `GET /my/factions`
- **Tag:** Factions
- **Auth:** Agent token required

Retrieve factions with which the agent has reputation.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |

### Responses

#### 200 OK — Default Response

**Content-Type:** `application/json`

- `data` **object[]** *(required)*
  - `symbol` **string** *(required)*
  - `reputation` **integer** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

