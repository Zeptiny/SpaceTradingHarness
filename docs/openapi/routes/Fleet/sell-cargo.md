# Sell Cargo

- **Operation ID:** `sell-cargo`
- **Endpoint:** `POST /my/ships/{shipSymbol}/sell`
- **Tag:** Fleet
- **Auth:** Agent token required

Sell cargo in your ship to a market that trades this cargo. The ship must be docked in a waypoint that has the `Marketplace` trait in order to use this function.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

**SellCargoRequest**

- `symbol` **[TradeSymbol](../schemas/TradeSymbol.md)** *(required)*
- `units` **integer** *(required)* — Amounts of units to sell of the selected good.

### Responses

#### 201 Created — Cargo was successfully sold.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `transaction` **[MarketTransaction](../schemas/MarketTransaction.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*

