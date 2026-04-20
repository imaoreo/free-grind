# Profiles

## RectF

Array of 4 floats or `nulls`:

- Bottom edge ("y2"), in pixels
- Left edge ("x1"), in pixels
- Right edge ("x2"), in pixels
- Top edge ("y1"), in pixels

When used in query, stringified as follows: `y2,x1,x2,y1`.

## ProfileMaskedMin

- `distance` — number or `null`
- `profileImageMediaHash` — string or `null`, see [Media](/grindr-api/media/index#media)
- `isFavorite` — boolean

## ProfileMasked

- *everything from [ProfileMaskedMin](#profilemaskedmin)*
- `lastViewed` — number or `null`
- `seen` — unix timestamp in milliseconds or `null`
- `sexualPosition` — integer or `null`, see [Sexual position ID](#sexual-position-id)
- `foundVia` — [ViewSourceEnum](/grindr-api/interest/views#viewsourceenum) or `null`
- `rightNow` — [RightNowStatus](/grindr-api/right-now#RightNowStatus)

## ProfileMin

- `profileId` — string with numeric id
- `displayName` — string or `null`
- `onlineUntil` — long number or `null`

## ProfileShort

- *everything from [ProfileMasked](#profilemasked)*
- *everything from [ProfileMin](#profilemin)*
- `age` — number, may be `0` or `null`
- `showAge` — boolean
- `showDistance` — boolean
- `approximateDistance` — boolean
- `lastChatTimestamp` — number, may be `0`
- `isNew` — boolean
- `lastUpdatedTime` — unix timestamp in milliseconds, may be `0`
- `medias` — array of profile photos objects
  - `mediaHash` — string, see [Media](/grindr-api/media/index#media)
  - `type` — integer
  - `state` — integer
  - `reason` — string or `null`
  - `takenOnGrindr` — boolean or `null`
  - `createdAt` — long number or `null`

## ProfileFields

- `meetAt` — array of integers, see [Meet at](#meet-at)
- `vaccines` — array of integers, see [Vaccines](#vaccines)
- `genders` — array of integers, see [Genders](#genders)
- `pronouns` — array of integers, see [Pronouns](#pronouns)

## Profile

- *everything from [ProfileShort](#profileshort)*
- *everything from [ProfileFields](#profilefields)*
- `aboutMe` — string or `null`
- `ethnicity` — integer or `null`, see [Ethnicity](#ethnicity)
- `relationshipStatus` — integer or `null`, see [Relationship status](#relationship-status)
- `grindrTribes` — array of integers, see [Tribes](#tribes)
- `lookingFor` — array of integers, see [Looking for](#looking-for)
- `bodyType` — number or `null`, see [Body type](#body-type)
- `hivStatus` — number or `null`, see [HIV status](#hiv-status)
- `lastTestedDate` — unix timestamp in milliseconds or `null`
- `height` — number or `null`
- `weight` — number or `null`
- `socialNetworks` — object
  - `twitter` — object, may be absent
    - `userId` — string or `null`
  - `facebook` — object, may be absent
    - `userId` — string or `null`
  - `instagram` — object, may be absent
    - `userId` — string or `null`
- `identity` — identity (unknown, wip) or `null`
- `nsfw` — integer or `null`, see [Accept NSFW pics](#accept-nsfw-pics)
- `hashtags` — unknown array
- `profileTags` — array of strings, see [Profile tags](#profile-tags)
- `tapped` — boolean
- `tapType` — boolean
- `lastReceivedTapTimestamp` — number or `null`
- `isTeleporting` — boolean
- `isRoaming` — boolean
- `arrivalDays` — number or `null`
- `unreadCount` — number, may be absent
- `rightNowText` — string or `null`
- `rightNowPosted` — long number or `null`
- `rightNowDistance` — long number or `null`
- `rightNowThumbnailUrl` — string or `null`
- `rightNowFullImageUrl` — string or `null`
- `rightNowShareLocation` — `null`
- `rightNowMedias` — array of objects
  - `mediaId` — long number or `null`
  - `thumbnailUrl` — string
  - `fullImageUrl` — string
  - `contentType` — string
  - `isNsfw` — boolean or `null`
- `verifiedInstagramId` — string or `null`
- `lastThrobTimestamp` — unknown
- `isBlockable` — boolean
- `sexualHealth` — array of integers, see [Sexual health](#sexual-health)
- `isVisiting` — boolean
- `travelPlans` — array of objects
  - `endDateUtc` — long or `null`
  - `geohash` — [Geohash](/grindr-api/browse/location#geohash)
  - `id` — long number or `null`
  - `locationName` — string
  - `showOnProfile` — boolean or `null`
  - `startDateUtc` — long number or `null`
- `isInAList` — boolean
- `showTribes` — boolean
- `showPosition` — boolean
- `tribesImInto` — null
- `showVipBadge` — boolean

## Profile tags

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/tags
```

Response:

Array of objects:

- `language` — string
- `categoryCollection` — array of objects
  - `text` — string
  - `possessiveText` string or `null`
  - `tags` — array of objects
    - `tagId` — integer
    - `text` — string
    - `key` — string

## Sexual position ID

- 1 — "Top"
- 2 — "Bottom"
- 3 — "Versatile"
- 4 — "Vers Bottom"
- 5 — "Vers Top"
- 6 — "Side"

## Ethnicity

- 1 — Asian
- 2 — Black
- 3 — Latino
- 4 — Middle Eastern
- 5 — Mixed
- 6 — Native American
- 7 — White
- 8 — Other
- 9 — South Asian

## Relationship status

- 1 — Single
- 2 — Dating
- 3 — Exclusive
- 4 — Committed
- 5 — Partnered
- 6 — Engaged
- 7 — Married
- 8 — Open Relationship

## Body type

- 1 — "Toned"
- 2 — "Average"
- 3 — "Large"
- 4 — "Muscular"
- 5 — "Slim"
- 6 — "Stocky"

## HIV status

Not to be confused with [Sexual health](#sexual-health).

- 1 — "Negative"
- 2 — "Negative, on PrEP"
- 3 — "Positive"
- 4 — "Positive, undetectable"

## Accept NSFW pics

- 1 — "Never"
- 2 — "Not At First"
- 3 — "Yes Please"

## Meet at

- 1 — "My Place"
- 2 — "Your Place"
- 3 — "Bar"
- 4 — "Coffee Shop"
- 5 — "Restaurant"

## Sexual health

Not to be confused with [HIV status](#hiv-status).

- 1 — "Condoms"
- 2 — "I'm on doxyPEP"
- 3 — "I'm on PrEP"
- 4 — "I'm HIV undetectable"
- 5 — "Prefer to discuss"

## Looking for

- 2 — Chat
- 3 — Dates
- 4 — Friends
- 5 — Networking
- 6 — Relationship
- 7 — Hookups

## Tribes

- 1 — "Bear"
- 2 — "Clean-Cut"
- 3 — "Daddy"
- 4 — "Discreet"
- 5 — "Geek"
- 6 — "Jock"
- 7 — "Leather"
- 8 — "Otter"
- 9 — "Poz"
- 10 — "Rugged"
- 11 — "Sober"
- 12 — "Trans"
- 13 — "Twink"

## Vaccines

- 1 - COVID-19
- 2 — Monkeypox
- 3 — Meningitis

## SocialNetwork

- `site` — string, e.g. `"twitter"` | `"facebook"` | `"instagram"`
- `userId` — string, username

## Managed fields

Managed fields, such as [gender](#get-genders) and [pronouns](#get-pronouns) are profile fields that aren't hardcoded but pulled dynamically from server.

## Get a profile by ID

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v7/profiles/{id}
```

Query:

- `id` — profile ID

Response:

- `profiles` - array of [Profile](#profile), always with exactly one element

## Get multiple profiles by ID

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v3/profiles
```

Body:

- `targetProfileIds` — array of strings with numeric ids

Response:

- `profiles` — array of [Profile](#profile)

## Update own profile (full)

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v3.1/me/profile
```

Body:

[Profile](#profile) object, fully replaces current version.

## Update own profile (partial)

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
PATCH /v4/me/profile
```

Body:

[Profile](#profile) object, only updates specified keys.

## Profile tags suggestions

See [Hardcoded fields -> Profile tags](#profile-tags).

- PUT /v4/profile-tags/suggestions ProfileTagsSuggestionRequest
- GET /v5/profile-tags/translations (header: L-Locale) . TranslationsResponse

## Upload media

```
POST /v5/chat/media/upload
```

Query:

- `length` — long
- `looping` — boolean
- `takenOnGrindr` — boolean


Body:

File

Correct request's `Content-Type` header is required.

Response:

- `mediaId` — long integer
- `mediaHash` — string, see [Media -> Signed CDN files](/grindr-api/media/signed-cdn-files)
- `url` — string, URL

## Upload media (legacy)

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/media/upload
```

*Also there is a legacy `POST /v3/me/profile/images`.*

Query:

- `thumbCoords` — [RectF](#rectf), see note below
- `takenOnGrindr` — boolean, only for v4 endpoint

You must ensure thumbCoords's width and height dimensions are equal, i.e. y2-y1 must equal to x2-x1. Submitting non-suqare thumbnail won't trigger any errors and it will be uploaded to CDN, however attempting to use such illegal thumbnail dimensions image in [Edit profile photos](#edit-profile-photos) will result in it being silently dropped/skipped.

Body:

Binary media file

Response:

- `hash` — string
- `imageSizes` — array of objects
  - `size` — integer or `null`
  - `fullUrl` — string
  - `thumbnail` — boolean or `null`
  - `state` — string, [MediaState](/grindr-api/media/signed-cdn-files#mediastate)
  - `mediaHash` — string, see [Media -> Public CDN files](/grindr-api/media/public-cdn-files)
  - `rejectionReason` — string or `null`
- `mediaId` — integer

## Get my profile photos

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v3.1/me/profile/images
```

Response:

- `medias` — array of objects
  - `mediaHash` — string, see [Media -> Public CDN files](/grindr-api/media/public-cdn-files)
  - `type` — unknown integer
  - `state` — integer, [MediaState](/grindr-api/media/signed-cdn-files#mediastate), WIP

## Edit profile photos

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v3/me/profile/images
```

Body:

- `primaryImageHash` — string or `null`, see [Media -> Public CDN file](/grindr-api/media/public-cdn-files)
- `secondaryImageHashes` — array (max. length: 5) of strings or `null` (note: see below), see [Media -> Public CDN file](/grindr-api/media/public-cdn-files)

Setting both `primaryImageHash` and `secondaryImageHashes` to `null` works. But setting `primaryImageHash` to a hash value while setting `secondaryImageHashes` to null causes HTTP status 400 Bad Request error. It's recommended to just use `[]` for `secondaryImageHashes` rather than `null`.

Supplied images must have square thumbnails, otherwise they will be silently skipped. See [Upload media](#upload-media).

Repeating `primaryImageHash` value in `secondaryImageHashes` array will result in secondaryImageHashes's entry being silently dropped from supplied request array. Repeating `secondaryImageHashes` values will result in successfully saving the array as-is to the server, however official mobile client seems to drop repeating media when processing `secondaryImageHashes` response.

Response:

Empty.

## Delete profile photos

Requires [Authorization](/grindr-api/api-authorization).

This endpoint removes photo from your profile as well as deletes the media from CDN.

```
DELETE /v3/me/profile/images
```

Body (yes, body, not query):

- `media_hashes` — array of strings

Response:

Empty.

## Check if profiles are reachable

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/profiles/reachable
```

Body:

- `profileIds` — array of strings with numeric ids

Response:

- `profileIds` — array of strings with numeric ids

## Get profile insights

```
GET /v1/profile-insights/{profileId}
```

Response: ProfileInsightsResponse, WIP

```
GET /v2/profile-insights/{profileId}
```

Response: ProfileInsightsV2Response, WIP


## Get pronouns

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/pronouns
```

Response:

Array of objects:

- `pronounId` — integer
- `pronoun` — string, e.g. `"-"` or `"They/Them/Theirs"`

## Get genders

```
GET /public/v2/genders
```

*Also aliased to `GET /public/v1/genders`*

Response:

Array of objects:

- `genderId` — integer
- `gender` — string
- `displayGroup` — integer
- `sortProfile` — integer or `null`
- `sortFilter` — integer or `null`
- `genderPlural` — string or `null`
- `excludeOnProfileSelection` — array of integers or `null`
- `excludeOnFilterSelection` — array of integers or `null`
- `alsoClassifiedAs` — array of integers

## Suggest gender or pronoun

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v4/genderpronoun/suggestions
```

Body:

- `category` — string, either `gender` or `pronoun`
- `suggestedValue` — string

Response:

Empty

