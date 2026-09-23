# `ShipCrew`

The ship's crew service and maintain the ship's systems and equipment.

## Properties

- `current` **integer** *(required)* — The current number of crew members on the ship.
- `required` **integer** *(required)* — The minimum number of crew members required to maintain the ship.
- `capacity` **integer** *(required)* — The maximum number of crew members the ship can support.
- `rotation` **string enum: `STRICT`, `RELAXED`** *(required)* — The rotation of crew shifts. A stricter shift improves the ship's performance. A more relaxed shift improves the crew's morale.
- `morale` **integer** *(required)* — A rough measure of the crew's morale. A higher morale means the crew is happier and more productive. A lower morale means the ship is more prone to accidents.
- `wages` **integer** *(required)* — The amount of credits per crew member paid per hour. Wages are paid when a ship docks at a civilized waypoint.
