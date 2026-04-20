# Views

## ViewSourceEnum

- `DISCOVER`
- `FOR_YOU`
- `UNKNOWN` (fallback)

## Get views number

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v6/views/eyeball
```

Response:

- `viewedCount` — number or `null`
- `mostRecent` — object or `null`
  - `profileId` — string with number
  - `photoHash` — 40 characters hex string
  - `timestamp` — unix timestamp in milliseconds

## Get viewers list

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v7/views/list
```

Response:

- `totalViewers` — integer
- `previews` — array of objects
  - *everything from [ProfileMasked](/grindr-api/users/profiles#profilemasked)*
  - `isInBadNeighborhood` — boolean
  - `isViewedMeFreshFace` — boolean
  - `isSecretAdmirer` — boolean
  - `viewedCount` — object
    - `totalCount` — integer
    - `maxDisplayCount` — integer
- `profiles` — array of objects
  - *everything from `previews`*
  - *everything from [ProfileShort](/grindr-api/users/profiles#profileshort)*
  - `hasFaceRecognition` — boolean
  - `isIncognito` — boolean
  - `boosting` — boolean
  - `showUnlockReward` — boolean
  - `unreadMessageCount` — integer
  - `hasChatted` — boolean

## Record profile views (batch)

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/views
```

Body:

- `viewedProfileIds` — array of strings with numeric ids
- `foundVia` — unknown or `null`

## Record single profile view

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/views/{profileId}
```

## Record profile view v2

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v5/views/{profileId}
```

Body:

- `foundVia` — unknown or `null`
- `source` — [ViewSourceEnum](#viewsourceenum)

