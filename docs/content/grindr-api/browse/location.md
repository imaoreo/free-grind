# Location

## Geohash

Grindr requires geohash to be exactly 12 characters long.

<https://en.wikipedia.org/wiki/Geohash>

Example: `gcw2jp5u2d1b`

Geohash explorer: <https://geohash.softeng.co/>

## Search places by name

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v3/places/search
```

Query:

- `placeName` — string, e.g. `Paris`

Response:

- `places` — array of objects
  - `name` — string
  - `address` — string or `null`
  - `lat` — number
  - `lon` — number
  - `placeId` — string with number
  - `importance` — float

## Update location

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v4/location
```

Body: 

- `geohash` — string, exactly 12 characters, see [geohash](#geohash)

Response:

Empty.
