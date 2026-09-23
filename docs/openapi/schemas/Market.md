# `Market`

Market details.

## Properties

- `symbol` **string** *(required)* — The symbol of the market. The symbol is the same as the waypoint where the market is located.
- `exports` **[TradeGood](../schemas/TradeGood.md)[]** *(required)* — The list of goods that are exported from this market.
- `imports` **[TradeGood](../schemas/TradeGood.md)[]** *(required)* — The list of goods that are sought as imports in this market.
- `exchange` **[TradeGood](../schemas/TradeGood.md)[]** *(required)* — The list of goods that are bought and sold between agents at this market.
- `transactions` **[MarketTransaction](../schemas/MarketTransaction.md)[]** — The list of recent transactions at this market. Visible only when a ship is present at the market.
- `tradeGoods` **[MarketTradeGood](../schemas/MarketTradeGood.md)[]** — The list of goods that are traded at this market. Visible only when a ship is present at the market.
