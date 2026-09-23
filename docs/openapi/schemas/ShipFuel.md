# `ShipFuel`

Details of the ship's fuel tanks including how much fuel was consumed during the last transit or action.

## Properties

- `current` **integer** *(required)* — The current amount of fuel in the ship's tanks.
- `capacity` **integer** *(required)* — The maximum amount of fuel the ship's tanks can hold.
- `consumed` **object** — An object that only shows up when an action has consumed fuel in the process. Shows the fuel consumption data.
  - `amount` **integer** *(required)* — The amount of fuel consumed by the most recent transit or action.
  - `timestamp` **string (date-time)** *(required)* — The time at which the fuel was consumed.
