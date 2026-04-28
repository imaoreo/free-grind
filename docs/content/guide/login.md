---
title: Signing In with a Token
---

# Sign In with a Token

This is the only way to sign into Free Grind using google, facebook, or apple. 

## What is the token?

It is a JWT (JSON Web Token) that allows Free Grind to make API requests, This token does NOT contain your password, but does allow the app access to your grindr account.

The token looks like this:

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9maWxlSWQiOiIxMjM0NTYiLCJleHAiOjE3...
```

## How to get your token

### Web

1. Open [Grindr Web Login](https://web.grindr.com/login) in your browser.
2. Open the browser's developer tools (usually F12 or right-click and "Inspect").
3. Go to the "Network" tab and log in to your account.

If logging in with third party:
4. Look for a request to `https://web.grindr.com/v1/third-party/`

If logging in with email and password:
4. Look for a request to `https://web.grindr.com/v1/api-tokens`

5. Click on the request then click on response
6. Look for the `jwt` field in the JSON response. This is your token.
7. Copy everything in the `jwt` field inside the quotes.
8. Paste the token into Free Grind.
9. Login and enjoy!

## Token expiry

Tokens expire after a period of time. If Free Grind shows an authentication error, return here and obtain a fresh token from the Grindr app. Expires after 15 minutes so be quick!

## Privacy note

Your token is stored locally in your device's secure keychain and is never sent to any Free Grind server. All requests go directly to Grindr's API.