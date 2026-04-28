# Contributing to Free Grind

Thanks for considering contributing to Free Grind.

To minimize effort and time spent on porting code across platform, the project is built with [Tauri](https://tauri.app/) — a crossplatform framework running same codebase on Windows, Linux, macOS, Android and iOS. Native clients are currently not planned but will be highly appreciated and featured.

## Project structure

[src/](./src/) — frontend built with Svelte
[src-tauri/](./src-tauri/) — backend built with Rust

PRs are welcome! All contributions must be aligned with [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Documentation

All research efforts contributing to [docs](./docs/content) are highly valued and appreciated! Seek for "WIP" in documents texts to find out which areas of API haven't been reverse engineered yet.

## Quick start

JS:

```ts
const securityHeaders = {
	"L-Locale": "en_US",
	"Accept-Language": "en-US",
	requireRealDeviceInfo: "true",
	"L-Time-Zone": "Europe/Madrid",
	"User-Agent": "grindr3/25.20.0.147239;147239;Free;Android 13;Pixel 7;Google",
	"L-Device-Info":
		"1fAf9fB2aFfd47Fd;GLOBAL;2;3543028095;2400x1080;a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	// modify params randomly if you're getting ACCOUNT_BANNED at login stage
};

const req = await fetch("https://grindr.mobi/v8/sessions", {
	method: "POST",
	headers: {
		Accept: "application/json",
		...securityHeaders,
	},
	body: JSON.stringify({
		email: "yourmail@example.org",
		password: "comment out this field after you log in once, use authToken to refresh session",
		// authToken:
		//	"just reuse any of previous authTokens, even expired",
		token: null,
		geohash: null,
	}),
});

process.stdout.write("Grindr3 " + (await req.json().then((t) => t.sessionId)));

```

## Contribution guidelines

AI-generated pull requests are not allowed. AI-assisted code is allowed.

## Notes

- API Authorization, security headers and transport layer are handled by Rust lib; this way the token can be stored securely without ever being exposed to frontend