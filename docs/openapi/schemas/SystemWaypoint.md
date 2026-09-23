# `SystemWaypoint`

Waypoint details.

## Properties

- `symbol` **[WaypointSymbol](../schemas/WaypointSymbol.md)** *(required)*
- `type` **[WaypointType](../schemas/WaypointType.md)** *(required)*
- `x` **integer** *(required)* — Relative position of the waypoint on the system's x axis. This is not an absolute position in the universe.
- `y` **integer** *(required)* — Relative position of the waypoint on the system's y axis. This is not an absolute position in the universe.
- `orbitals` **[WaypointOrbital](../schemas/WaypointOrbital.md)[]** *(required)* — Waypoints that orbit this waypoint.
- `orbits` **string** — The symbol of the parent waypoint, if this waypoint is in orbit around another waypoint. Otherwise this value is undefined.
