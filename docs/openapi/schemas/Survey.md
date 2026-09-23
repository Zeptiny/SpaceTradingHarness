# `Survey`

A resource survey of a waypoint, detailing a specific extraction location and the types of resources that can be found there.

## Properties

- `signature` **string** *(required)* — A unique signature for the location of this survey. This signature is verified when attempting an extraction using this survey.
- `symbol` **string** *(required)* — The symbol of the waypoint that this survey is for.
- `deposits` **[SurveyDeposit](../schemas/SurveyDeposit.md)[]** *(required)* — A list of deposits that can be found at this location. A ship will extract one of these deposits when using this survey in an extraction request. If multiple deposits of the same type are present, the chance of extracting that deposit is increased.
- `expiration` **string (date-time)** *(required)* — The date and time when the survey expires. After this date and time, the survey will no longer be available for extraction.
- `size` **[SurveySize](../schemas/SurveySize.md)** *(required)*
