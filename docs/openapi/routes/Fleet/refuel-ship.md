# Refuel Ship

- **Operation ID:** `refuel-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/refuel`
- **Tag:** Fleet
- **Auth:** Agent token required

Refuel your ship by buying fuel from the local market.

Requires the ship to be docked in a waypoint that has the `Marketplace` trait, and the market must be selling fuel in order to refuel.

Each fuel bought from the market replenishes 100 units in your ship's fuel.

Ships will always be refuel to their frame's maximum fuel capacity when using this action.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields optional)*

- `units` **integer** — The amount of fuel to fill in the ship's tanks. When not specified, the ship will be refueled to its maximum fuel capacity. If the amount specified is greater than the ship's remaining capacity, the ship will only be refueled to its maximum fuel capacity. The amount specified is not in market units but in ship fuel units.
- `fromCargo` **anyOf composite** — Wether to use the FUEL thats in your cargo or not.
  - **anyOf:**
    - boolean
    - any

**Content-Type:** `text/plain`

- string

### Responses

#### 200 OK — Refueled successfully.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `fuel` **[ShipFuel](../schemas/ShipFuel.md)** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)**
  - `transaction` **[MarketTransaction](../schemas/MarketTransaction.md)** *(required)*

