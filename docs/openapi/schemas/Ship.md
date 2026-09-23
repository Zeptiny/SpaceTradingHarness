# `Ship`

Ship details.

## Properties

- `symbol` **string** *(required)* — The globally unique identifier of the ship in the following format: `[AGENT_SYMBOL]-[HEX_ID]`
- `registration` **[ShipRegistration](../schemas/ShipRegistration.md)** *(required)*
- `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*
- `crew` **[ShipCrew](../schemas/ShipCrew.md)** *(required)*
- `frame` **[ShipFrame](../schemas/ShipFrame.md)** *(required)*
- `reactor` **[ShipReactor](../schemas/ShipReactor.md)** *(required)*
- `engine` **[ShipEngine](../schemas/ShipEngine.md)** *(required)*
- `modules` **[ShipModule](../schemas/ShipModule.md)[]** *(required)* — Modules installed in this ship.
- `mounts` **[ShipMount](../schemas/ShipMount.md)[]** *(required)* — Mounts installed in this ship.
- `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
- `fuel` **[ShipFuel](../schemas/ShipFuel.md)** *(required)*
- `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
