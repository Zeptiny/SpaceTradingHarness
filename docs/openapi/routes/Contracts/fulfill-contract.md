# Fulfill Contract

- **Operation ID:** `fulfill-contract`
- **Endpoint:** `POST /my/contracts/{contractId}/fulfill`
- **Tag:** Contracts
- **Auth:** Agent token required

Fulfill a contract. Can only be used on contracts that have all of their delivery terms fulfilled.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `contractId` | path | yes | string | The ID of the contract to fulfill. |

### Responses

#### 200 OK — Successfully fulfilled a contract.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `contract` **[Contract](../schemas/Contract.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*

