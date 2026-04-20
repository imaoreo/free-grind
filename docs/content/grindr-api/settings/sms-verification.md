# SMS verification

TODO: wip

## SmsSendCodeRequest

- `country_code` — string
- `phone_number` — string

## Send SMS code

```
- POST /v4/sms/verification/{profileId}/sendcode
```

Body:

[SmsSendCodeRequest](#smssendcoderequest)

Response:

- `code` — number or `null`
- `message` — string, e.g. `"Profile is not verification required"` or `"Profile is already verified"`

## Verify SMS code

```
POST /v4/sms/verification/{profileId}/verifycode SmsVerifyCodeRequest
```

Response:

- `code` — number or `null`
- `message` — string, e.g. `"Profile is not verification required"` or `"Profile is already verified"`

## Request SMS code for password change

```
POST /v4/sms/users/update-password/sendcode
```

Body:

[SmsSendCodeRequest](#smssendcoderequest)

<!-- ### SMS verification

```
POST /v4/sms/sendcode
```

Body:

[SmsSendCodeRequest](#smssendcoderequest)

Response:

Empty. -->

## Verify SMS code (legacy)

```
POST /v4/sms/verifycode
```

Body:

- `country_code` — string
- `phone_number` — string
- `code` — string

Response:

Empty.

## Face recognition, WIP

- POST /v4/recognition/face FaceDetectionResult

## Spotify token, WIP

- POST /api/token (URL-encoded) see below SpotifyAuthResponse

## Delete account

WIP

Requires [Authorization](/grindr-api/api-authorization).

```
DELETE /v3/me/profile
```

