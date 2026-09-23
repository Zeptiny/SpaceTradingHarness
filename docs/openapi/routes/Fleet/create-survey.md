# Create Survey

- **Operation ID:** `create-survey`
- **Endpoint:** `POST /my/ships/{shipSymbol}/survey`
- **Tag:** Fleet
- **Auth:** Agent token required

Create surveys on a waypoint that can be extracted such as asteroid fields. A survey focuses on specific types of deposits from the extracted location. When ships extract using this survey, they are guaranteed to procure a high amount of one of the goods in the survey.

In order to use a survey, send the entire survey details in the body of the extract request.

Each survey may have multiple deposits, and if a symbol shows up more than once, that indicates a higher chance of extracting that resource.

Your ship will enter a cooldown after surveying in which it is unable to perform certain actions. Surveys will eventually expire after a period of time or will be exhausted after being extracted several times based on the survey's size. Multiple ships can use the same survey for extraction.

A ship must have the `Surveyor` mount installed in order to use this function.

### Parameters

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `shipSymbol` | path | yes | string | The symbol of the ship. |

### Responses

#### 201 Created — Surveys has been created.

**Content-Type:** `application/json`

- `data` **object** *(required)*
  - `cooldown` **[Cooldown](../schemas/Cooldown.md)** *(required)*
  - `surveys` **[Survey](../schemas/Survey.md)[]** *(required)* — Surveys created by this action.

