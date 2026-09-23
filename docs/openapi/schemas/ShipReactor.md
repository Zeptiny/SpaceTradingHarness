# `ShipReactor`

The reactor of the ship. The reactor is responsible for powering the ship's systems and weapons.

## Properties

- `symbol` **string enum: `REACTOR_SOLAR_I`, `REACTOR_FUSION_I`, `REACTOR_FISSION_I`, `REACTOR_CHEMICAL_I`, `REACTOR_ANTIMATTER_I`** *(required)* — Symbol of the reactor.
- `name` **string** *(required)* — Name of the reactor.
- `condition` **[ShipComponentCondition](../schemas/ShipComponentCondition.md)** *(required)*
- `integrity` **[ShipComponentIntegrity](../schemas/ShipComponentIntegrity.md)** *(required)*
- `description` **string** *(required)* — Description of the reactor.
- `powerOutput` **integer** *(required)* — The amount of power provided by this reactor. The more power a reactor provides to the ship, the lower the cooldown it gets when using a module or mount that taxes the ship's power.
- `requirements` **[ShipRequirements](../schemas/ShipRequirements.md)** *(required)*
- `quality` **[ShipComponentQuality](../schemas/ShipComponentQuality.md)** *(required)*
