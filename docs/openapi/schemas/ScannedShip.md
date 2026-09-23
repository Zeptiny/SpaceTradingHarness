# `ScannedShip`

The ship that was scanned. Details include information about the ship that could be detected by the scanner.

## Properties

- `symbol` **string** *(required)* — The globally unique identifier of the ship.
- `registration` **[ShipRegistration](../schemas/ShipRegistration.md)** *(required)*
- `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*
- `frame` **object** — The frame of the ship.
  - `symbol` **string** *(required)* — The symbol of the frame.
- `reactor` **object** — The reactor of the ship.
  - `symbol` **string** *(required)* — The symbol of the reactor.
- `engine` **object** *(required)* — The engine of the ship.
  - `symbol` **string** *(required)* — The symbol of the engine.
- `mounts` **object[]** — List of mounts installed in the ship.
  - `symbol` **string** *(required)* — The symbol of the mount.
