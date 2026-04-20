# Travels

## Get travel plans

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v6/profiles/travel/{profileId}
```

Response:

- `travelPlans` — array of objects
  - `travelPlanId` — long integer, required for update, ignored for create
  - `profileId` — long integer
  - `geohash` — [Geohash](/grindr-api/browse/location#geohash)
  - `startDate` — long integer, unix timestamp in milliseconds
  - `endDate` — long integer, unix timestamp in milliseconds
  - `showOnProfile` — boolean
  - `notes` — string
  
## Create travel plans

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v6/profiles/travel
```

Body:

- `profileId` — long integer
- `geohash` — [Geohash](/grindr-api/browse/location#geohash)
- `startDate` — long integer, unix timestamp in milliseconds
- `endDate` — long integer, unix timestamp in milliseconds
- `showOnProfile` — boolean
- `notes` — string

Response:

Empty.

## Update travel plans

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v6/profiles/travel/update
```

Body:

- `travelPlanId` — long integer
- `profileId` — long integer
- `geohash` — [Geohash](/grindr-api/browse/location#geohash)
- `startDate` — long integer, unix timestamp in milliseconds
- `endDate` — long integer, unix timestamp in milliseconds
- `showOnProfile` — boolean
- `notes` — string

Response:

Empty.

## Delete travel plans

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
DELETE /v6/profiles/travel/{travelPlanId}
```

Response:

Empty.

