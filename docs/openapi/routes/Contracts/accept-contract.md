# Accept Contract

- **Operation ID:** `accept-contract`
- **Endpoint:** `POST /my/contracts/{contractId}/accept`
- **Tag:** Contracts
- **Auth:** Agent token required

Accept a contract by ID. 

You can only accept contracts that were offered to you, were not accepted yet, and whose deadlines has not passed yet.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `contractId` | path | yes | string | The contract ID to accept. |

### Responses

#### 200 OK — Successfully accepted contract.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `contract` **[Contract](../schemas/Contract.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*

