# Favorites

## Add favorite

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v3/me/favorites/{profileId}
```

Response:

Empty object (`{}`).

## Remove favorite

Requires [Authorization](/grindr-api/api-authorization).

```
DELETE /v3/me/favorites/{profileId}
```

Response:

Empty object (`{}`).

## Get all notes

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/favorites/notes
```

Response:

Array of objects:

- `notes` — string
- `phoneNumber` — string, might be empty
- `counterpartyId` — profile ID

## Get note

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/favorites/notes/{targetProfileId}
```

Response:

- `notes` — string, empty for nonexistent notes
- `phoneNumber` — string, might be empty

## Add note

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v1/favorites/notes/{targetProfileId}
```

Body:

- `notes` — string, required
- `phoneNumber` — string, required

*The `counterpartyId` parameter seems to be ignored, it's unknown what its purpose is.*

Response:

Empty, HTTP status 204.

## Delete note

Requires [Authorization](/grindr-api/api-authorization).

```
DELETE /v1/favorites/notes/{targetProfileId}
```

*Essentially equivalent to [Add note](#add-note) with `notes` set to `""`.*

