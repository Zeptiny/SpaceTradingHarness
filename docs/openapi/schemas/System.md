# `System`

System details.

## Properties

- `constellation` **string** — The constellation that the system is part of.
- `symbol` **string** *(required)* — The symbol of the system.
- `sectorSymbol` **string** *(required)* — The symbol of the sector.
- `type` **[SystemType](../schemas/SystemType.md)** *(required)*
- `x` **integer** *(required)* — Relative position of the system in the sector in the x axis.
- `y` **integer** *(required)* — Relative position of the system in the sector in the y axis.
- `waypoints` **[SystemWaypoint](../schemas/SystemWaypoint.md)[]** *(required)* — Waypoints in this system.
- `factions` **[SystemFaction](../schemas/SystemFaction.md)[]** *(required)* — Factions that control this system.
- `name` **string** — The name of the system.
