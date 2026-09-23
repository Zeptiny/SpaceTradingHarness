# Describes trade relationships

- **Operation ID:** `get-supply-chain`
- **Endpoint:** `GET /market/supply-chain`
- **Tag:** Data
- **Auth:** Agent token required

Describes which import and exports map to each other.

### Responses

#### 200 OK — Successfully retrieved the supply chain information

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `exportToImportMap` **object** *(required)*

