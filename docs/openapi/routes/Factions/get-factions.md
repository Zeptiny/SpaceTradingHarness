# List factions

- **Operation ID:** `get-factions`
- **Endpoint:** `GET /factions`
- **Tag:** Factions
- **Auth:** Anonymous or agent token

Return a paginated list of all the factions in the game.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `page` | query | no | integer | What entry offset to request |
| `limit` | query | no | integer | How many entries to return per page |

### Responses

#### 200 OK — Successfully fetched factions.

**Content-Type:** `application/json`

- `data` **[Faction](../schemas/Faction.md)[]** *(required)*
- `meta` **[Meta](../schemas/Meta.md)** *(required)*

