# `Waypoint`

A waypoint is a location that ships can travel to such as a Planet, Moon or Space Station.

## Properties

- `symbol` **[WaypointSymbol](../schemas/WaypointSymbol.md)** *(required)*
- `type` **[WaypointType](../schemas/WaypointType.md)** *(required)*
- `systemSymbol` **[SystemSymbol](../schemas/SystemSymbol.md)** *(required)*
- `x` **integer** *(required)* — Relative position of the waypoint on the system's x axis. This is not an absolute position in the universe.
- `y` **integer** *(required)* — Relative position of the waypoint on the system's y axis. This is not an absolute position in the universe.
- `orbitals` **[WaypointOrbital](../schemas/WaypointOrbital.md)[]** *(required)* — Waypoints that orbit this waypoint.
- `orbits` **string** — The symbol of the parent waypoint, if this waypoint is in orbit around another waypoint. Otherwise this value is undefined.
- `faction` **[WaypointFaction](../schemas/WaypointFaction.md)**
- `traits` **[WaypointTrait](../schemas/WaypointTrait.md)[]** *(required)* — The traits of the waypoint.
- `modifiers` **[WaypointModifier](../schemas/WaypointModifier.md)[]** — The modifiers of the waypoint.
- `chart` **[Chart](../schemas/Chart.md)**
- `isUnderConstruction` **boolean** *(required)* — True if the waypoint is under construction.
