# Account

## Account settings, WIP

- POST /v3/users/password-validation ValidatePasswordComplexityRequest
- POST /v3/gcm-push-tokens FcmPushRequest
- POST /v3/users/update-password ChangePasswordRequest ChangePasswordResponse
- POST /v3/users/email UpdateEmailRequest AuthResponse
- POST (dynamic, WIP) LoginEmailRequest AuthResponse
- POST /v4/sms/users/update-password ChangePasswordPhoneRequest ChangePasswordResponse
- POST (dynamic, WIP) CreateAccountEmailRequest FirstPartyCreateAccountResponse
- POST /v7/users/thirdparty CreateThirdPartyAccountRequest ThirdPartyCreateAccountResponse
- POST /v3/users/forgot-password ForgotPwdEmailRequest ForgotPwdEmailResponse
- POST /v3/users/thirdparty/exchange GoogleAccessTokenRequest GoogleAccessTokenResponse
- POST /v4/sms/sessions LoginPhoneRequest AuthResponse
- POST (dynamic, WIP) ThirdPartyRequest ThirdPartyAuthResponse
- POST (dynamic, WIP) ThirdPartySessionRequest ThirdPartyAuthResponse

## Get preferences

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v3/me/prefs/settings
```

Response:

- `profileId` — integer
- `locationSearchOptOut` — boolean
- `incognito` — boolean
- `hideViewedMe` — boolean
- `approximateDistance` — boolean
- `viewRightNowNsfw` — boolean

## Set preferences

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v3/me/prefs/settings
```

Body:

- `locationSearchOptOut` — boolean
- `incognito` — boolean
- `hideViewedMe` — boolean
- `approximateDistance` — boolean
- `viewRightNowNsfw` — boolean

Response:

Empty.

## Get visiting settings

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/visiting/settings
```

Response:

- `setting` — string, e.g. `"AUTO"`

## Set visiting settings

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v1/visiting/settings
```

Body:

- `setting` — string, e.g. `"AUTO"`, WIP

Resonse:

Empty.

## Get home location

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/visiting/home
```

Response:

- `name` — string, [human-readable name](/grindr-api/browse/location#search-places-by-name) of location
- `lat` — float
- `lon` — float

## Set home location

Requires [Authorization](/grindr-api/api-authorization).

```
PUT /v1/visiting/home
```

Body:

- `lat` — float
- `lon` — float

Response:

- `name` — string, [human-readable name](/grindr-api/browse/location#search-places-by-name) of location
- `lat` — float
- `lon` — float

