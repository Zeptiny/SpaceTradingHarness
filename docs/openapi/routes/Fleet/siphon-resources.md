# Siphon Resources

- **Operation ID:** `siphon-resources`
- **Endpoint:** `POST /my/ships/{shipSymbol}/siphon`
- **Tag:** Fleet
- **Auth:** Agent token required

Siphon gases or other resources from gas giants.

The ship must be in orbit to be able to siphon and must have siphon mounts and a gas processor installed.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Siphon successful.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `siphon` **[Siphon](../schemas/Siphon.md)** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*
  - `events` **[ShipConditionEvent](../schemas/ShipConditionEvent.md)[]** *(required)*

