# Social events

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/social-events
```

Query:

- `geohash` — string, optional
- `sort` — string, optional
- `region` — string, optional

Response:

- `events` — array of objects
  - `socialEventId` — long
  - `name` — string
  - `location` — string
  - `startTime` — unix timestamp in milliseconds
  - `endTime` — unix timestamp in milliseconds
  - `eventType` — string, e.g. `FESTIVAL` | `KINK` | `PRIDE`
  - `eventImageUrl` — string
  - `imageSource` — string
  - `region` — string
  - `attendeesPreview` — array of objects
    - `profileId` — long integer
    - `profileImageUrl` — string, may be empty
  - `timezone` — string
  - `isAttending` — boolean
