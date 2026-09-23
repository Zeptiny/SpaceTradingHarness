# Install Mount

- **Operation ID:** `install-mount`
- **Endpoint:** `POST /my/ships/{shipSymbol}/mounts/install`
- **Tag:** Fleet
- **Auth:** Agent token required

Install a mount on a ship.

In order to install a mount, the ship must be docked and located in a waypoint that has a `Shipyard` trait. The ship also must have the mount to install in its cargo hold.

An installation fee will be deduced by the Shipyard for installing the mount on the ship.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

**Install Mount Request**

- `symbol` **string** *(required)* — The symbol of the mount to install.

### Responses

#### 201 Created — Successfully installed the mount.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*
  - `mounts` **[ShipMount](../schemas/ShipMount.md)[]** *(required)* — List of installed mounts after the installation of the new mount.
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `transaction` **[ShipModificationTransaction](../schemas/ShipModificationTransaction.md)** *(required)*

