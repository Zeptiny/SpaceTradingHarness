# Supply Construction Site

- **Operation ID:** `supply-construction`
- **Endpoint:** `POST /systems/{systemSymbol}/waypoints/{waypointSymbol}/construction/supply`
- **Tag:** Systems
- **Auth:** Agent token required

Supply a construction site with the specified good. Requires a waypoint with a property of `isUnderConstruction` to be true.

The good must be in your ship's cargo. The good will be removed from your ship's cargo and added to the construction site's materials.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `systemSymbol` | path | yes | string | The system symbol |
| `waypointSymbol` | path | yes | string | The waypoint symbol |

### Request Body

**Content-Type:** `application/json` *(all fields required)*

- `shipSymbol` **string** *(required)* — The symbol of the ship supplying construction materials.
- `tradeSymbol` **allOf composite** *(required)* — The symbol of the good to supply.
  - [`TradeSymbol`](../schemas/TradeSymbol.md)
- `units` **integer** *(required)* — Amount of units to supply.

### Responses

#### 201 Created — Successfully supplied construction site.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `construction` **[Construction](../schemas/Construction.md)** *(required)*
  - `cargo` **[ShipCargo](../schemas/ShipCargo.md)** *(required)*

