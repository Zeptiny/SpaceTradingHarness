# Create Chart

- **Operation ID:** `create-chart`
- **Endpoint:** `POST /my/ships/{shipSymbol}/chart`
- **Tag:** Fleet
- **Auth:** Agent token required

Command a ship to chart the waypoint at its current location.

Most waypoints in the universe are uncharted by default. These waypoints have their traits hidden until they have been charted by a ship.

Charting a waypoint will record your agent as the one who created the chart, and all other agents would also be able to see the waypoint's traits. Charting a waypoint gives you a one time reward of credits based on the rarity of the waypoint's traits.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Successfully charted waypoint.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `chart` **[Chart](../schemas/Chart.md)** *(required)*
  - `waypoint` **[Waypoint](../schemas/Waypoint.md)** *(required)*
  - `transaction` **[ChartTransaction](../schemas/ChartTransaction.md)** *(required)*
  - `agent` **[Agent](../schemas/Agent.md)** *(required)*

