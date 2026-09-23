# Extract Resources

- **Operation ID:** `extract-resources`
- **Endpoint:** `POST /my/ships/{shipSymbol}/extract`
- **Tag:** Fleet
- **Auth:** Agent token required

Extract resources from a waypoint that can be extracted, such as asteroid fields, into your ship. Send an optional survey as the payload to target specific yields.

The ship must be in orbit to be able to extract and must have mining equipments installed that can extract goods, such as the `Gas Siphon` mount for gas-based goods or `Mining Laser` mount for ore-based goods.

The survey property is now deprecated. See the `extract/survey` endpoint for more details.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Successfully extracted resources.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `extraction` **[Extraction](../schemas/Extraction.md)** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `modifiers` **[WaypointModifier](../schemas/WaypointModifier.md)[]**
  - `events` **[ShipConditionEvent](../schemas/ShipConditionEvent.md)[]** *(required)*

