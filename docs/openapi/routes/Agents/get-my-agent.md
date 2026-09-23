# Get Agent

- **Operation ID:** `get-my-agent`
- **Endpoint:** `GET /my/agent`
- **Tag:** Agents
- **Auth:** Agent token required

Fetch your agent's details.

### Responses

#### 200 OK — Successfully fetched agent details.

**Content-Type:** `application/json`

- `data` **[Agent](../schemas/Agent.md)** *(required)*

