# Jettison Cargo

- **Operation ID:** `jettison`
- **Endpoint:** `POST /my/ships/{shipSymbol}/jettison`
- **Tag:** Fleet
- **Auth:** Agent token required

Jettison cargo from your ship's cargo hold.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `symbol` **[TradeSymbol](../schemas/TradeSymbol.md)** *(required)*
- `units` **integer** *(required)* — Amount of units to jettison of this good.

### Responses

#### 200 OK — Jettison successful.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*

