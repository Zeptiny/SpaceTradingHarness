# `ShipFrame`

The frame of the ship. The frame determines the number of modules and mounting points of the ship, as well as base fuel capacity. As the condition of the frame takes more wear, the ship will become more sluggish and less maneuverable.

## Properties

- `symbol` **string enum: `FRAME_PROBE`, `FRAME_DRONE`, `FRAME_INTERCEPTOR`, `FRAME_RACER`, `FRAME_FIGHTER`, `FRAME_FRIGATE`, `FRAME_SHUTTLE`, `FRAME_EXPLORER`, `FRAME_MINER`, `FRAME_LIGHT_FREIGHTER`, `FRAME_HEAVY_FREIGHTER`, `FRAME_TRANSPORT`, `FRAME_DESTROYER`, `FRAME_CRUISER`, `FRAME_CARRIER`, `FRAME_BULK_FREIGHTER`** *(required)* — Symbol of the frame.
- `name` **string** *(required)* — Name of the frame.
- `condition` **[ShipComponentCondition](../schemas/ShipComponentCondition.md)** *(required)*
- `integrity` **[ShipComponentIntegrity](../schemas/ShipComponentIntegrity.md)** *(required)*
- `description` **string** *(required)* — Description of the frame.
- `moduleSlots` **integer** *(required)* — The amount of slots that can be dedicated to modules installed in the ship. Each installed module take up a number of slots, and once there are no more slots, no new modules can be installed.
- `mountingPoints` **integer** *(required)* — The amount of slots that can be dedicated to mounts installed in the ship. Each installed mount takes up a number of points, and once there are no more points remaining, no new mounts can be installed.
- `fuelCapacity` **integer** *(required)* — The maximum amount of fuel that can be stored in this ship. When refueling, the ship will be refueled to this amount.
- `requirements` **[ShipRequirements](../schemas/ShipRequirements.md)** *(required)*
- `quality` **[ShipComponentQuality](../schemas/ShipComponentQuality.md)** *(required)*
