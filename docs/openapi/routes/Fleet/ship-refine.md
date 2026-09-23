# Ship Refine

- **Operation ID:** `ship-refine`
- **Endpoint:** `POST /my/ships/{shipSymbol}/refine`
- **Tag:** Fleet
- **Auth:** Agent token required

Attempt to refine the raw materials on your ship. The request will only succeed if your ship is capable of refining at the time of the request. In order to be able to refine, a ship must have goods that can be refined and have installed a `Refinery` module that can refine it.

When refining, 100 basic goods will be converted into 10 processed goods.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `produce` **string enum: `IRON`, `COPPER`, `SILVER`, `GOLD`, `ALUMINUM`, `PLATINUM`, `URANITE`, `MERITIUM`, `FUEL`** *(required)* — The type of good to produce out of the refining process.

### Responses

#### 201 Created — The ship has successfully refined goods.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `produced` **object[]** *(required)* — Goods that were produced by this refining process.
    - `tradeSymbol` **allOf composite** *(required)* — Symbol of the good.
      - [`TradeSymbol`](../schemas/TradeSymbol.md)
    - `units` **integer** *(required)* — Amount of units of the good.
  - `consumed` **object[]** *(required)* — Goods that were consumed during this refining process.
    - `tradeSymbol` **allOf composite** *(required)* — Symbol of the good.
      - [`TradeSymbol`](../schemas/TradeSymbol.md)
    - `units` **integer** *(required)* — Amount of units of the good.

