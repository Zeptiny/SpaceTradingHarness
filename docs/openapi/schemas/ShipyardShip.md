# `ShipyardShip`

Ship details available at a shipyard.

## Properties

- `type` **[ShipType](../schemas/ShipType.md)** *(required)*
- `name` **string** *(required)* — Name of the ship.
- `description` **string** *(required)* — Description of the ship.
- `activity` **[ActivityLevel](../schemas/ActivityLevel.md)**
- `supply` **[SupplyLevel](../schemas/SupplyLevel.md)** *(required)*
- `purchasePrice` **integer** *(required)* — The purchase price of the ship.
- `frame` **[ShipFrame](../schemas/ShipFrame.md)** *(required)*
- `reactor` **[ShipReactor](../schemas/ShipReactor.md)** *(required)*
- `engine` **[ShipEngine](../schemas/ShipEngine.md)** *(required)*
- `modules` **[ShipModule](../schemas/ShipModule.md)[]** *(required)* — Modules installed in this ship.
- `mounts` **[ShipMount](../schemas/ShipMount.md)[]** *(required)* — Mounts installed in this ship.
- `crew` **object** *(required)*
  - `required` **integer** *(required)* — The minimum number of crew members required to maintain the ship.
  - `capacity` **integer** *(required)* — The maximum number of crew members the ship can support.
