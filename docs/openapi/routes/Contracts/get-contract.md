# Get Contract

- **Operation ID:** `get-contract`
- **Endpoint:** `GET /my/contracts/{contractId}`
- **Tag:** Contracts
- **Auth:** Agent token required

Get the details of a specific contract.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `contractId` | path | yes | string | The contract ID to accept. |

### Responses

#### 200 OK — Successfully fetched contract.

**Content-Type:** `application/json`

- `data` **[Contract](../schemas/Contract.md)** *(required)*

