# API Authorization

Authorization header is formed from Grindr3 prefix and auth token:

```
Authorization: Grindr3 [session ID]
```

Session ID is a JWT, see [Session ID](/grindr-api/authentication#session-id). Session IDs are short-lived (exactly 30 minutes) and non-extendable (expiration duration is fixed). However, issuing subsequent requests to [Sign in endpoint](/grindr-api/authentication#sign-in) with any of `authToken`s (regardless of whether they're expired or not) allows you to generate more Session IDs. Previous Session ID JWT tokens aren't revoked, meaning you can request a new Session ID any time you need to make a request, but to avoid hitting [rate limits](/grindr-api/rate-limits), consider caching them until a token either expires or becomes non valid for any other reason.

