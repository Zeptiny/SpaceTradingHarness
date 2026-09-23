# `ShipEngine`

The engine determines how quickly a ship travels between waypoints.

## Properties

- `symbol` **string enum: `ENGINE_IMPULSE_DRIVE_I`, `ENGINE_ION_DRIVE_I`, `ENGINE_ION_DRIVE_II`, `ENGINE_HYPER_DRIVE_I`** *(required)* — The symbol of the engine.
- `name` **string** *(required)* — The name of the engine.
- `condition` **[ShipComponentCondition](../schemas/ShipComponentCondition.md)** *(required)*
- `integrity` **[ShipComponentIntegrity](../schemas/ShipComponentIntegrity.md)** *(required)*
- `description` **string** *(required)* — The description of the engine.
- `speed` **integer** *(required)* — The speed stat of this engine. The higher the speed, the faster a ship can travel from one point to another. Reduces the time of arrival when navigating the ship.
- `requirements` **[ShipRequirements](../schemas/ShipRequirements.md)** *(required)*
- `quality` **[ShipComponentQuality](../schemas/ShipComponentQuality.md)** *(required)*
