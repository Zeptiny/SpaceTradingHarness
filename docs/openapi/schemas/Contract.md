# `Contract`

Contract details.

## Properties

- `id` **string** *(required)* — ID of the contract.
- `factionSymbol` **string** *(required)* — The symbol of the faction that this contract is for.
- `type` **string enum: `PROCUREMENT`, `TRANSPORT`, `SHUTTLE`** *(required)* — Type of contract.
- `terms` **[ContractTerms](../schemas/ContractTerms.md)** *(required)*
- `accepted` **boolean** *(required)* — Whether the contract has been accepted by the agent
- `fulfilled` **boolean** *(required)* — Whether the contract has been fulfilled
- `expiration` **string (date-time)** *(required)* — Deprecated in favor of deadlineToAccept
- `deadlineToAccept` **string (date-time)** — The time at which the contract is no longer available to be accepted
