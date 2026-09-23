# Get public details for a specific agent.

- **Operation ID:** `get-agent`
- **Endpoint:** `GET /agents/{agentSymbol}`
- **Tag:** Agents
- **Auth:** Anonymous or agent token

Get public details for a specific agent.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `agentSymbol` | path | yes | string | The agent symbol |

### Responses

#### 200 OK — Default Response

**Content-Type:** `application/json`

- `data` **[PublicAgent](../schemas/PublicAgent.md)** *(required)*

