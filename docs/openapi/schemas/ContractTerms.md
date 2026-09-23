# `ContractTerms`

The terms to fulfill the contract.

## Properties

- `deadline` **string (date-time)** *(required)* — The deadline for the contract.
- `payment` **[ContractPayment](../schemas/ContractPayment.md)** *(required)*
- `deliver` **[ContractDeliverGood](../schemas/ContractDeliverGood.md)[]** — The cargo that needs to be delivered to fulfill the contract.
