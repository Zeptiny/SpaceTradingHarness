# Faction details

- **Operation ID:** `get-faction`
- **Endpoint:** `GET /factions/{factionSymbol}`
- **Tag:** Factions
- **Auth:** Agent token required

View the details of a faction.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `factionSymbol` | path | yes | string | The faction symbol |

### Responses

#### 200 OK — Default Response

**Content-Type:** `application/json`

- `data` **[Faction](../schemas/Faction.md)** *(required)*

