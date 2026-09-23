# Extract Resources with Survey

- **Operation ID:** `extract-resources-with-survey`
- **Endpoint:** `POST /my/ships/{shipSymbol}/extract/survey`
- **Tag:** Fleet
- **Auth:** Agent token required

Use a survey when extracting resources from a waypoint. This endpoint requires a survey as the payload, which allows your ship to extract specific yields.

Send the full survey object as the payload which will be validated according to the signature. If the signature is invalid, or any properties of the survey are changed, the request will fail.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Request Body

**Content-Type:** `application/json` *(all fields optional)*

[`Survey`](../schemas/Survey.md)

### Responses

#### 201 Created — Successfully extracted resources.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `extraction` **[Extraction](../schemas/Extraction.md)** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `modifiers` **[WaypointModifier](../schemas/WaypointModifier.md)[]**
  - `events` **[ShipConditionEvent](../schemas/ShipConditionEvent.md)[]** *(required)*

