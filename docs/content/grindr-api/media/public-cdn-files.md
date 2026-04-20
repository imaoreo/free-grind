# Public CDN files

CDN files that are public are accessible directly using their hash, e.g. [profile images](#profile-images)

Base URL:

```
https://cdns.grindr.com
```

## Profile images

```
/images/profile/{size}/{mediaHash}
```

One side will always be the requested size and another will be less or equal to the requested size.

Available sizes for `{size}` parameter:

- `2048x2048` (might be unavailable)
- `1024x1024`
- `480x480`
- `320x320`

## Thumbnails images

```
/images/thumb/{size}/{mediaHash}
```

Image will be cropped at center and both sides will be exactly the requested size.

Available sizes for `{size}` parameter:
- `480x480` (might be unavailable)
- `320x320`
- `75x75`

## Grindr Gaymoji

List gaymojis:

```
GET /grindr/chat/gaymoji
```

Response:

Formatted JSON object:

- `lastUpdateTime` — unix timestamp in milliseconds
- `gaymoji` — array of objects
  - `name` — unique identificator consisting of alphanumeric characters, hyphens and underscores
  - `id` — same as `name` + `.png`
  - `category` — [GaymojiCategory](#gaymojicategory)
- `category` — array of objects
  - `name` — [GaymojiCategory](#gaymojicategory)
  - `expiredTime` — unix timestamp in milliseconds, may be `0`

The image file assosiated with the Gaymoji is hosted at:

```
/grindr/chat/gaymoji/{id}
```

ID must include file extension.

## GaymojiCategory

One of the following values:

- `body`
- `dating+sex`
- `featured`
- `holiday`
- `mood`
- `objects`
- `profile`
- `wen_ching_taiwan_stickers`

