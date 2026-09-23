# `ShipModificationTransaction`

Result of a transaction for a ship modification, such as installing a mount or a module.

## Properties

- `waypointSymbol` **string** *(required)* — The symbol of the waypoint where the transaction took place.
- `shipSymbol` **string** *(required)* — The symbol of the ship that made the transaction.
- `tradeSymbol` **string** *(required)* — The symbol of the trade good.
- `totalPrice` **integer** *(required)* — The total price of the transaction.
- `timestamp` **string (date-time)** *(required)* — The timestamp of the transaction.
