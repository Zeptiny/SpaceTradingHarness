# `ShipNavRoute`

The routing information for the ship's most recent transit or current location.

## Properties

- `destination` **[ShipNavRouteWaypoint](../schemas/ShipNavRouteWaypoint.md)** *(required)*
- `origin` **[ShipNavRouteWaypoint](../schemas/ShipNavRouteWaypoint.md)** *(required)*
- `departureTime` **string (date-time)** *(required)* — The date time of the ship's departure.
- `arrival` **string (date-time)** *(required)* — The date time of the ship's arrival. If the ship is in-transit, this is the expected time of arrival.
