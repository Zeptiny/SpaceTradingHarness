# Negotiate Contract

- **Operation ID:** `negotiate-contract`
- **Endpoint:** `POST /my/ships/{shipSymbol}/negotiate/contract`
- **Tag:** Fleet
- **Auth:** Agent token required

Negotiate a new contract with the HQ.

In order to negotiate a new contract, an agent must not have ongoing or offered contracts over the allowed maximum amount. Currently the maximum contracts an agent can have at a time is 1.

Once a contract is negotiated, it is added to the list of contracts offered to the agent, which the agent can then accept. 

The ship must be present at any waypoint with a faction present to negotiate a contract with that faction.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Successfully negotiated a new contract.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `contract` **[Contract](../schemas/Contract.md)** *(required)*

