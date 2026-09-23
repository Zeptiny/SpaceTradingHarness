# `ContractDeliverGood`

The details of a delivery contract. Includes the type of good, units needed, and the destination.

## Properties

- `tradeSymbol` **string** *(required)* — The symbol of the trade good to deliver.
- `destinationSymbol` **string** *(required)* — The destination where goods need to be delivered.
- `unitsRequired` **integer** *(required)* — The number of units that need to be delivered on this contract.
- `unitsFulfilled` **integer** *(required)* — The number of units fulfilled on this contract.
