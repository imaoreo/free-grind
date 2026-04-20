# Hides

Unknown how it's different from [blocks](/grindr-api/browse/blocks), WIP. Blocks API is preferred until this is figured out.

## Get hidden users

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/hides
```

Response:

- `hides` — array of objects
  - `profileId` — integer
  - `displayName` — string
  - `mediaHash` — string, appears to be just `"hash"`

## Hide a user

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
POST /v1/me/hides/{profileId}
```

Response:

- `updateTime` — integer, appears to be `0`

## Unhide a user

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
DELETE /v1/hides/{profileId}
```

Response:

Emtpy.

## Unhide all hidden users

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
DELETE /v1/hides
```

Response:

Emtpy.
