# Get System

- **Operation ID:** `get-system`
- **Endpoint:** `GET /systems/{systemSymbol}`
- **Tag:** Systems
- **Auth:** Anonymous or agent token

Get the details of a system. Requires the system to have been visited or charted.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string |  |

### Responses

#### 200 OK — Successfully fetched the system.

**Content-Type:** `application/json`

- `data` **[System](../schemas/System.md)** *(required)*

