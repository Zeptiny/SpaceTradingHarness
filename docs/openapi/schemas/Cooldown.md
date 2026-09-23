# `Cooldown`

A cooldown is a period of time in which a ship cannot perform certain actions.

## Properties

- `shipSymbol` **string** *(required)* — The symbol of the ship that is on cooldown
- `totalSeconds` **integer** *(required)* — The total duration of the cooldown in seconds
- `remainingSeconds` **integer** *(required)* — The remaining duration of the cooldown in seconds
- `expiration` **string (date-time)** — The date and time when the cooldown expires in ISO 8601 format
