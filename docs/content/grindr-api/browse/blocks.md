# Blocks

Blocking a user automatically deletes the conversation for both of you.

## Get blocked users

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v3.1/me/blocks
```

Response:

- `blocking` — array of objects
  - `profileId` — integer
  - `blockedTime` — integer, appears to be `0`

## Block a user

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
POST /v3/me/blocks/{profileId}
```

Response:

- `updateTime` — integer, appears to be `0`

## Unblock a user

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
DELETE /v3/me/blocks/{targetProfileId}
```

Response:

Empty.

## Unblock all users

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
DELETE /v3/me/blocks
```

Response:

Emtpy.
