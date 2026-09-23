# `MarketTransaction`

Result of a transaction with a market.

## Properties

- `waypointSymbol` **[WaypointSymbol](../schemas/WaypointSymbol.md)** *(required)*
- `shipSymbol` **string** *(required)* — The symbol of the ship that made the transaction.
- `tradeSymbol` **string** *(required)* — The symbol of the trade good.
- `type` **string enum: `PURCHASE`, `SELL`** *(required)* — The type of transaction.
- `units` **integer** *(required)* — The number of units of the transaction.
- `pricePerUnit` **integer** *(required)* — The price per unit of the transaction.
- `totalPrice` **integer** *(required)* — The total price of the transaction.
- `timestamp` **string (date-time)** *(required)* — The timestamp of the transaction.
