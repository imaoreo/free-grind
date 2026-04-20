# Security headers

Security headers are intended to make reverse engineering more complex and my life harder. They are arbitrary strings appended to request, formed by algorithm defined in Grindr app and they're very likely to change with each new app release to break all existing side clients.

Also it's recommended to set `Accept: application/json` header at all times except `/v3/bootstrap` (this one returns empty response if this header is present).

## `L-Device-Info`

Absense or incorrect forming of this header might lead to HTTP status 403 and Cloudflare block page.

```
<deviceId>;GLOBAL;<deviceType>;<totalRAM>;<screenResolution>;<advertisingId>
```

- `deviceId` — 16 hex characters
- `GLOBAL` — hardcoded channel/flavor
- `deviceType` — `1` if `Build.CPU_ABI == "x86"` (emulator), `2` otherwise (real device)
- `totalRam` — ActivityManager.MemoryInfo.totalMem
- `screenResolution` — "heightPx x widthPx" e.g. `2400x1080`
- `advertisingId` — Google Advertising ID, falls back to `00000000-0000-0000-0000-000000000000` if unavailable

Example: `a1b2c3d4e5f60789;GLOBAL;2;8026152960;2400x1080;550e8400-e29b-41d4-a716-446655440000`

## `User-Agent`

Absense or incorrect forming of this header might lead to HTTP status 400 and `urn:gr:err:header` API error or 403 [WebSocket](/grindr-api/websocket/index#websocket) connection error.

```
grindr3/25.20.0.147239;147239;<subscriptionTier>;Android <osVersion>;<deviceModel>;<manufacturer>
```

- `subscriptionTier`: `Free`, `Plus`, `Xtra`, `Unlimited`, `Premium`, `Free_Plus`, `Free_Xtra`, `Free_Unlimited`, `Free_Premium`
 
Example: `grindr3/25.20.0.147239;147239;Free;Android 13;Pixel 7;Google`

## `requireRealDeviceInfo`

Send as-is in camelCase. Must be set to `true` for most endpoints.

## `L-Time-Zone`

[Time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) in format Country/Region. E.g. `America/New_York` or `Europe/Madrid`. Unknown whether this value is checked against your IP's ISP location.

## `L-Locale`

Should be set along with `Accept-Language` to a language. 

- Format for Accept-Language: `en-US`
- Format for L-Locale: `en_US`

Note the hyphen/underscore.
