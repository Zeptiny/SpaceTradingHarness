# Get Ship Cooldown

- **Operation ID:** `get-ship-cooldown`
- **Endpoint:** `GET /my/ships/{shipSymbol}/cooldown`
- **Tag:** Fleet
- **Auth:** Agent token required

Retrieve the details of your ship's reactor cooldown. Some actions such as activating your jump drive, scanning, or extracting resources taxes your reactor and results in a cooldown.

Your ship cannot perform additional actions until your cooldown has expired. The duration of your cooldown is relative to the power consumption of the related modules or mounts for the action taken.

Response returns a 204 status code (no-content) when the ship has no cooldown.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 200 OK — Successfully fetched ship's cooldown.

**Content-Type:** `application/json`

- `data` **[Cooldown](../schemas/Cooldown.md)** *(required)*

#### 204 No Content — No cooldown.

**Content-Type:** `application/json`

- any

