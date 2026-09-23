# `Faction`

Faction details.

## Properties

- `symbol` **[FactionSymbol](../schemas/FactionSymbol.md)** *(required)*
- `name` **string** *(required)* — Name of the faction.
- `description` **string** *(required)* — Description of the faction.
- `headquarters` **string** — The waypoint in which the faction's HQ is located in.
- `traits` **[FactionTrait](../schemas/FactionTrait.md)[]** *(required)* — List of traits that define this faction.
- `isRecruiting` **boolean** *(required)* — Whether or not the faction is currently recruiting new agents.
