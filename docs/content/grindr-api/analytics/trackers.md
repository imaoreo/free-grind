# Trackers

## Bulk exposure

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v2/bulk-exposure
```

Body:

- `exposures` — array of objects
  - `key` — string
  - `geohash` — [Geohash](/grindr-api/browse/location#geohash)

Response:

Empty.
