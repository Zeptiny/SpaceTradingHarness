# Get Account

- **Operation ID:** `get-my-account`
- **Endpoint:** `GET /my/account`
- **Tag:** Accounts
- **Auth:** Agent token required

Fetch your account details.

### Responses

#### 200 OK — Default Response

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `account` **object** *(required)*
    - `id` **string** *(required)*
    - `email` **string** *(required)*
    - `token` **string**
    - `createdAt` **string (date-time)** *(required)*

