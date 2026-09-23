# `Shipyard`

Shipyard details.

## Properties

- `symbol` **string** *(required)* — The symbol of the shipyard. The symbol is the same as the waypoint where the shipyard is located.
- `shipTypes` **object[]** *(required)* — The list of ship types available for purchase at this shipyard.
  - `type` **[ShipType](../schemas/ShipType.md)** *(required)*
- `transactions` **[ShipyardTransaction](../schemas/ShipyardTransaction.md)[]** — The list of recent transactions at this shipyard.
- `ships` **[ShipyardShip](../schemas/ShipyardShip.md)[]** — The ships that are currently available for purchase at the shipyard.
- `modificationsFee` **integer** *(required)* — The fee to modify a ship at this shipyard. This includes installing or removing modules and mounts on a ship. In the case of mounts, the fee is a flat rate per mount. In the case of modules, the fee is per slot the module occupies.
