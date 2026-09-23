# List all public agent details.

- **Operation ID:** `get-agents`
- **Endpoint:** `GET /agents`
- **Tag:** Agents
- **Auth:** Anonymous or agent token

List all public agent details.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |

### Responses

#### 200 OK — Successfully fetched agents details.

**Content-Type:** `application/json`

- `data` **[PublicAgent](../schemas/PublicAgent.md)[]** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

