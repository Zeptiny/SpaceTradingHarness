# `ShipyardTransaction`

Results of a transaction with a shipyard.

## Properties

- `waypointSymbol` **[WaypointSymbol](../schemas/WaypointSymbol.md)** *(required)*
- `shipSymbol` **string** *(required)* — The symbol of the ship type (e.g. SHIP_MINING_DRONE) that was the subject of the transaction. Contrary to what the name implies, this is NOT the symbol of the ship that was purchased.
- `shipType` **string** *(required)* — The symbol of the ship type (e.g. SHIP_MINING_DRONE) that was the subject of the transaction.
- `price` **integer** *(required)* — The price of the transaction.
- `agentSymbol` **string** *(required)* — The symbol of the agent that made the transaction.
- `timestamp` **string (date-time)** *(required)* — The timestamp of the transaction.
