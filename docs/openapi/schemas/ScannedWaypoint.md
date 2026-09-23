# `ScannedWaypoint`

A waypoint that was scanned by a ship.

## Properties

- `symbol` **[WaypointSymbol](../schemas/WaypointSymbol.md)** *(required)*
- `type` **[WaypointType](../schemas/WaypointType.md)** *(required)*
- `systemSymbol` **[SystemSymbol](../schemas/SystemSymbol.md)** *(required)*
- `x` **integer** *(required)* — Position in the universe in the x axis.
- `y` **integer** *(required)* — Position in the universe in the y axis.
- `orbitals` **[WaypointOrbital](../schemas/WaypointOrbital.md)[]** *(required)* — List of waypoints that orbit this waypoint.
- `faction` **[WaypointFaction](../schemas/WaypointFaction.md)**
- `traits` **[WaypointTrait](../schemas/WaypointTrait.md)[]** *(required)* — The traits of the waypoint.
- `chart` **[Chart](../schemas/Chart.md)**
