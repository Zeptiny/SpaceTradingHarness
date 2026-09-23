# Subscribe to events

- **Operation ID:** `websocket-departure-events`
- **Endpoint:** `GET /my/socket.io`
- **Tag:** Data
- **Auth:** Agent token required

Subscribe to departure events for a system.

          ## WebSocket Events

          The following events are available:

          - `systems.{systemSymbol}.departure`: A ship has departed from the system.

          ## Subscribe using a message with the following format:

          ```json
          {
            "action": "subscribe",
            "systemSymbol": "{systemSymbol}"
          }
          ```

          ## Unsubscribe using a message with the following format:

          ```json
          {
            "action": "unsubscribe",
            "systemSymbol": "{systemSymbol}"
          }
          ```

### Responses

#### 200 OK — Default Response

