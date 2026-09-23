# Dock Ship

- **Operation ID:** `dock-ship`
- **Endpoint:** `POST /my/ships/{shipSymbol}/dock`
- **Tag:** Fleet
- **Auth:** Agent token required

Attempt to dock your ship at its current location. Docking will only succeed if your ship is capable of docking at the time of the request.

Docked ships can access elements in their current location, such as the market or a shipyard, but cannot do actions that require the ship to be above surface such as navigating or extracting.

The endpoint is idempotent - successive calls will succeed even if the ship is already docked.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — The ship has successfully docked at its current location.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `nav` **[ShipNav](../schemas/ShipNav.md)** *(required)*

