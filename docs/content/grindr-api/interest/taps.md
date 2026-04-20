# Taps

## Tap ID

- `0` — "FRIENDLY" ("hi" or 🍪 based on client's rendering settings)
- `1` — "HOT" (🔥)
- `2` — "LOOKING" (😈)
- `3` — "NONE"

Cookie taps are essentially bubbles "hi" but your client can choose to render them as 🍪. There is no separate cookie tap type.

## Get received taps

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v2/taps/received
```

Response:

- `profiles`
  - *everything from [ProfileMaskedMin](/grindr-api/users/profiles#profilemaskedmin)*
  - *everything from [ProfileMin](/grindr-api/users/profiles#profilemin)*
  - `timestamp`
  - `tapType`
  - `lastOnline`
  - `isBoosting`
  - `isMutual`
  - `rightNowType`
  - `isViewable`

## Send a tap

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests result in `Invalid request` error and HTTP status 400.

```
POST /v2/taps/add
```

Body:

- `recipientId` — long integer, [profile id](/grindr-api/users/profiles#profile)
- `tapType` — [Tap ID](#tap-id), invalid or nonexistent Tap IDs are still recorded as successfull

Response:

- `isMutual` — boolean

## Get sent taps

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/interactions/taps/sent
```

Response:

- `senderId` — integer
- `receiverId` — integer
- `tapType` — [Tap ID](#tap-id)
- `sentOn` — unix timestamp in milliseconds
- `deleted` — boolean
- `readOn` — unknown or `null`
