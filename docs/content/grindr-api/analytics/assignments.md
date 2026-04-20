# Assignments

Assignments are used for feature flagging and A/B testing. They can be assigned to users based on their geohash, allowing for location-based feature rollouts and experiments.

## Assignment

- `key` — string, e.g. `"ai-consent-2026"`
- `value` — string, e.g. `"off"` or `"on"` or `"Test"`
- `payload` — arbitrary data object
- `type` — string, e.g. `"FEATURE_FLAG"` or `"EXPERIMENT"`

## Get public assignments

```
GET /public/v1/public-features
```

Response:

- `assignments` — array of [Assignment](#assignment)

## Get assignments

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v3/assignment
```

Query:

- `geohash` — [Geohash](/grindr-api/browse/location#geohash)

Response:

- `assignments` — array of [Assignment](#assignment)

