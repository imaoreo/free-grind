# Grid

[Cascade](#get-cascade) returns stuff like advertisements, upsells and partial profiles, presumably ranking by algorithms or paid subscriptions. [Search](#search) returns full profiles, seemengly ranked simply by distance.

## GridQuery

- `nearbyGeoHash` — [Geohash](/grindr-api/browse/location#geohash)
- `exploreGeoHash` — [Geohash](/grindr-api/browse/location#geohash), optional
- `photoOnly` — boolean, optional
- `faceOnly` — boolean, optional
- `notRecentlyChatted` — boolean, optional
- `hasAlbum` — boolean, optional
- `fresh` — boolean, optional
- `genders` — string, see [Get genders](/grindr-api/users/profiles#get-genders), optional
- `pageNumber` — integer, optional

## CascadeQuery

- *everything from [GridQuery](#gridquery)*
- `onlineOnly` — boolean, optional
- `ageMin` — integer, optional
- `ageMax` — integer, optional
- `heightCmMin` — float, optional
- `heightCmMax` — float, optional
- `weightGramsMin` — float, optional
- `weightGramsMax` — float, optional
- `tribes` — string, see [Tribes](/grindr-api/users/profiles#tribes), optional
- `lookingFor` — string, see [Looking for](/grindr-api/users/profiles#looking-for), optional
- `relationshipStatuses` — string, see [Relationship status](/grindr-api/users/profiles#relationship-status), optional
- `bodyTypes` — string, see [Body type](/grindr-api/users/profiles#body-type), optional
- `sexualPositions` — string, see [Sexual position ID](/grindr-api/users/profiles#sexual-position-id), optional
- `meetAt` — string, see [Meet at](/grindr-api/users/profiles#meet-at), optional
- `nsfwPics` — string, see [Accept NSFW pics](/grindr-api/users/profiles#accept-nsfw-pics), optional
- `tags` — string, see [Profile tags](/grindr-api/users/profiles#profile-tags), optional
- `rightNow` — boolean, optional
- `favorites` — boolean, optional
- `showSponsoredProfiles` — boolean, optional
- `shuffle` — boolean, optional
- `hot` — boolean, optional

## CascadeResponseProfile

- `profileId` — integer
- `onlineUntil` — unix timestamp in milliseconds
- `displayName` — string
- `distanceMeters` — integer, may be absent
- `rightNow` — [RightNowStatus](/grindr-api/right-now#RightNowStatus)
- `unreadCount` — integer
- `isVisiting` — boolean
- `isPopular` — boolean

Only for [v3/cascade](#get-cascade-legacy):

- `lastOnline` — unix timestamp in milliseconds
- `photoMediaHashes` - array of strings, see [Media](/grindr-api/media/index#media)
- `lookingFor` — array of integers, see [Looking for](/grindr-api/users/profiles#looking-for)
- `sexualPosition` — integer, see [Sexual position ID](/grindr-api/users/profiles#sexual-position-id), may be absent
- `approximateDistance` — boolean
- `isFavorite` — boolean
- `isBoosting` — boolean
- `hasChattedInLast24Hrs` — boolean
- `hasUnviewedSpark` — boolean
- `isTeleporting` — boolean
- `isRoaming` — boolean
- `isRightNow` — boolean
- `hasUnreadThrob` — boolean
- `isBlockable` — boolean
- `isBoostingSomewhereElse` — boolean

Only for [v4/cascade](#get-cascade):

- `primaryImageUrl` — string, URL
- `favorite` — boolean
- `viewed` — boolean
- `chatted` — boolean
- `roaming` — boolean

## CascadeResponse

- `items` — array of objects
  - `type` — string, see below
  - `data` — object, has different field for each `type`:
    - *[`full_profile_v1`](#full_profile_v1)*
    - *[`advert_v1`](#advert_v1)*
    - *[`top_picks_v1`](#advert_v1)*
    - *[`partial_profile_v1`](#partial_profile_v1)*
    - *[`explore_aggregation_v1`](#explore_aggregation_v1)*
    - *[`boost_upsell_v1`](#boost_upsell_v1)*
    - *[`unlimited_mpu_v1`](#unlimited_mpu_v1)*
    - *[`xtra_mpu_v1`](#xtra_mpu_v1)*
- `nextPage` — integer
- `shuffled` — boolean
- `hiddenProfiles` — unknown
- `hiddenProfileInfo` — unknown


### `partial_profile_v1`

- *everything from [CascadeResponseProfile](#cascaderesponseprofile)*
- `upsellItemType` — string, e.g. `"xtra_mpu_v1"`

Only for [v3/cascade](#get-cascade-legacy):

- `@type` — string, `"CascadeItemData$PartialProfileV1"`

### `full_profile_v1`

- *everything from [CascadeResponseProfile](#cascaderesponseprofile)*

Only for [v3/cascade](#get-cascade-legacy):

- *everything from [ProfileFields](/grindr-api/users/profiles#profilefields)*
- `@type` — string, `"CascadeItemData$FullProfileV1"`
- `tribes` — array of integers, see [Tribes](/grindr-api/users/profiles#tribes)
- `socialNetworks` — array of [SocialNetwork](/grindr-api/users/profiles#socialnetwork)
- `takenOnGrindrMetadata` — object
  - *key is [Media hash](/grindr-api/media/index#media)*
    - `takenOnGrindr` — boolean
    - `createdAt` — unix timestamp in milliseconds

Only for [v4/cascade](#get-cascade):

- `age` — integer
- `heightCm` — integer
- `weightGrams` — integer
- `bodyType` — integer, see [Body type](/grindr-api/users/profiles#body-type)

### `explore_aggregation_v1`

- `uuid` — string, UUIDv4
- `headerName` — string, e.g. `🌎 Explore`
- `source` — string, e.g. `cascade`
- `items` — array of objects:
  - `@type` — string, see below
  - *`"ExploreAggregationItem$Location"` type*:
  - `data` — object:
    - `onlineCount` — integer
    - `uuid` — string, UUIDv3
    - `location` — object
      - `id` — integer
      - `name` — string, e.g. `Minneapolis`
      - `suffix` — string, e.g. `🇺🇸`
      - `lat` — float
      - `lon` — float
    - `profiles` — array of objects:
      - `profileImageUrl` — string, URL
  - *`"ExploreAggregationItem$Cta"` type*:
  - *empty*

Only for [v3/cascade](#get-cascade-legacy):

- `@type` — string, always `"CascadeItemData$ExploreAggregationV1"`

### `advert_v1`

- `cascadePlacementName` — string, e.g. `"mrec-cascade-first"`

Only for [v3/cascade](#get-cascade-legacy):

- `@type` — string, always `"CascadeItemData$Advert"`

### `boost_upsell_v1`

Only for [v3/cascade](#get-cascade-legacy):

- `@type` — string, always `"CascadeItemData$BoostUpsellV1"`

Empty for [v4/cascade](#get-cascade).

### `unlimited_mpu_v1`

Only for [v3/cascade](#get-cascade-legacy):

- `@type` — string, always `"CascadeItemData$UnlimitedMpuV1"`

Empty for [v4/cascade](#get-cascade).

### `xtra_mpu_v1`

Only for [v3/cascade](#get-cascade-legacy):

- `@type` — string, always `"CascadeItemData$XtraMpuV1"`

Empty for [v4/cascade](#get-cascade).

## Get Cascade

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v4/cascade
```

Query:

[CascadeQuery](#cascadequery)

Response:

[CascadeResponse](#cascaderesponse)

## Get Cascade (legacy)

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v3/cascade
```

Query:

- *everything from [CascadeQuery](#cascadequery)*
- `exploreUuid` — string, unknown, WIP, optional
- `sexualHealth` — string, see [Sexual health](/grindr-api/users/profiles#sexual-health), optional

Response:

[CascadeResponse](#cascaderesponse)

## Search

Requires [Authorization](/grindr-api/api-authorization).

Results array appears to be capped to 600 per page. Use `searchAfterProfileId` or `searchAfterDistance` for pagination.

```
GET /v7/search
```

- *everything from [GridQuery](#gridquery)*
- `online` — boolean, optional
- `ageMinimum` — integer, optional
- `ageMaximum` — integer, optional
- `heightMinimum` — float, optional
- `heightMaximum` — float, optional
- `weightMinimum` — float, optional
- `weightMaximum` — float, optional
- `grindrTribesIds` — string, see [Tribes](/grindr-api/users/profiles#tribes), optional
- `lookingForIds` — string, see [Looking for](/grindr-api/users/profiles#looking-for), optional
- `relationshipStatusIds` — string, see [Relationship status](/grindr-api/users/profiles#relationship-status), optional
- `bodyTypeIds` — string, see [Body type](/grindr-api/users/profiles#body-type), optional
- `sexualPositionIds` — string, see [Sexual position](#position-id), optional
- `meetAtIds` — string, see [Meet at](/grindr-api/users/profiles#meet-at), optional
- `nsfwIds` — string, see [Accept NSFW pics](/grindr-api/users/profiles#accept-nsfw-pics), optional
- `profileTags` — string, see [Profile tags](/grindr-api/users/profiles#profile-tags), optional
- `searchAfterDistance` — string, optional
- `searchAfterProfileId` — string, optional
- `freeFilter` — boolean, optional

Response:

- `profiles` — array of objects:
  - `age` — integer or `null`
  - `displayName` — string
  - `distance` — float
  - `hasFaceRecognition` — boolean
  - `isFavorite` — boolean
  - `new` — boolean
  - `lastChatTimestamp` — number
  - `lastViewed` — unix timestamp in milliseconds or `null`
  - `lastUpdatedTime` — unix timestamp in milliseconds
  - `medias` — array of objects or `null`:
    - `mediaHash` — [Media hash](/grindr-api/media/index#media)
    - `type` — integer, WIP
    - `state` — integer, WIP
  - `profileId` — integer
  - `profileImageMediaHash` — [Media hash](/grindr-api/media/index#media) or `null`
  - `profileTags` — array of [Profile tags](/grindr-api/users/profiles#profile-tags)
  - `seen` — unix timestamp in milliseconds
  - `showAge` —  boolean
  - `showDistance` — boolean
  - `approximateDistance` — boolean
  - `boosting` — boolean
  - `hasAlbum` — boolean
  - `gender` — array of integers or `[-1]`, see [Get genders](/grindr-api/users/profiles#get-genders)
- `lastDistanceInKm` — float
- `lastProfileId` — integer
- `inserts` — object:
  - `mpuFree` — integer
  - `mpuXtra` — integer
  - `boostUpsell` — array of integers
  - `mrecCascadeFirst` — integer
  - `mrecCascadeSecond` — integer
  - `mrecCascadeThird` — integer
