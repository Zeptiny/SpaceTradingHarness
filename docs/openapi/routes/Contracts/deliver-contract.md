# Deliver Cargo to Contract

- **Operation ID:** `deliver-contract`
- **Endpoint:** `POST /my/contracts/{contractId}/deliver`
- **Tag:** Contracts
- **Auth:** Agent token required

Deliver cargo to a contract.

In order to use this API, a ship must be at the delivery location (denoted in the delivery terms as `destinationSymbol` of a contract) and must have a number of units of a good required by this contract in its cargo.

Cargo that was delivered will be removed from the ship's cargo.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `contractId` | path | yes | string | The ID of the contract. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `shipSymbol` **string** *(required)* — Symbol of a ship located in the destination to deliver a contract and that has a good to deliver in its cargo.
- `tradeSymbol` **string** *(required)* — The symbol of the good to deliver.
- `units` **integer** *(required)* — Amount of units to deliver.

### Responses

#### 200 OK — Successfully delivered cargo to contract.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `contract` **[Contract](../schemas/Contract.md)** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*

