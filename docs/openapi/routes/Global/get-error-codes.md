# Error code list

- **Operation ID:** `get-error-codes`
- **Endpoint:** `GET /error-codes`
- **Tag:** Global
- **Auth:** Anonymous or agent token

Return a list of all possible error codes thrown by the game server.

### Responses

#### 200 OK — Fetched error codes successfully.

**Content-Type:** `application/json`

- `errorCodes` **object[]** *(required)*
  - `code` **number** *(required)*
  - `name` **string** *(required)*

