# `ShipMount`

A mount is installed on the exterier of a ship.

## Properties

- `symbol` **string enum: `MOUNT_GAS_SIPHON_I`, `MOUNT_GAS_SIPHON_II`, `MOUNT_GAS_SIPHON_III`, `MOUNT_SURVEYOR_I`, `MOUNT_SURVEYOR_II`, `MOUNT_SURVEYOR_III`, `MOUNT_SENSOR_ARRAY_I`, `MOUNT_SENSOR_ARRAY_II`, `MOUNT_SENSOR_ARRAY_III`, `MOUNT_MINING_LASER_I`, `MOUNT_MINING_LASER_II`, `MOUNT_MINING_LASER_III`, `MOUNT_LASER_CANNON_I`, `MOUNT_MISSILE_LAUNCHER_I`, `MOUNT_TURRET_I`** *(required)* — Symbol of this mount.
- `name` **string** *(required)* — Name of this mount.
- `description` **string** *(required)* — Description of this mount.
- `strength` **integer** — Mounts that have this value, such as mining lasers, denote how powerful this mount's capabilities are.
- `deposits` **string enum: `QUARTZ_SAND`, `SILICON_CRYSTALS`, `PRECIOUS_STONES`, `ICE_WATER`, `AMMONIA_ICE`, `IRON_ORE`, `COPPER_ORE`, `SILVER_ORE`, `ALUMINUM_ORE`, `GOLD_ORE`, `PLATINUM_ORE`, `DIAMONDS`, `URANITE_ORE`, `MERITIUM_ORE`[]** — Mounts that have this value denote what goods can be produced from using the mount.
- `requirements` **[ShipRequirements](../schemas/ShipRequirements.md)** *(required)*
