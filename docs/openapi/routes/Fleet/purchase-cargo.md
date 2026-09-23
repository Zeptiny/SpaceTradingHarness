# Purchase Cargo

- **Operation ID:** `purchase-cargo`
- **Endpoint:** `POST /my/ships/{shipSymbol}/purchase`
- **Tag:** Fleet
- **Auth:** Agent token required

Purchase cargo from a market.

The ship must be docked in a waypoint that has `Marketplace` trait, and the market must be selling a good to be able to purchase it.

The maximum amount of units of a good that can be purchased in each transaction are denoted by the `tradeVolume` value of the good, which can be viewed by using the Get Market action.

Purchased goods are added to the ship's cargo hold.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

**Purchase Cargo Request**

- `symbol` **[TradeSymbol](../schemas/TradeSymbol.md)** *(required)*
- `units` **integer** *(required)* — The number of units of the good to purchase.

### Responses

#### 201 Created — Purchased goods successfully.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `transaction` **[MarketTransaction](../schemas/MarketTransaction.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*

