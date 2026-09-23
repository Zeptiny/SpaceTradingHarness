# Purchase Ship

- **Operation ID:** `purchase-ship`
- **Endpoint:** `POST /my/ships`
- **Tag:** Fleet
- **Auth:** Agent token required

Purchase a ship from a Shipyard. In order to use this function, a ship under your agent's ownership must be in a waypoint that has the `Shipyard` trait, and the Shipyard must sell the type of the desired ship.

Shipyards typically offer ship types, which are predefined templates of ships that have dedicated roles. A template comes with a preset of an engine, a reactor, and a frame. It may also include a few modules and mounts.

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `shipType` **[ShipType](../schemas/ShipType.md)** *(required)*
- `waypointSymbol` **string** *(required)* — The symbol of the waypoint you want to purchase the ship at.

### Responses

#### 201 Created — Purchased ship successfully.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `ship` **[Ship](../schemas/Ship.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `transaction` **[ShipyardTransaction](../schemas/ShipyardTransaction.md)** *(required)*

