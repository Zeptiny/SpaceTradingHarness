# Get Agent Events

- **Operation ID:** `get-my-agent-events`
- **Endpoint:** `GET /my/agent/events`
- **Tag:** Agents
- **Auth:** Agent token required

Get recent events for your agent.

### Responses

#### 200 OK — Default Response

**Content-Type:** `application/json`

- `data` **[AgentEvent](../schemas/AgentEvent.md)[]** *(required)*

