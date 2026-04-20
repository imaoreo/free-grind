# Signed CDN files

CDN files accessible via signed URLs signed with `Signature` query argument. New signed URLs are generated and populated in API responses when existing URL expires. `Expires` query argument holds expiration date in unix timestamp in seconds, 15 minutes.

Base URL appears to be:

```
https://d2wxe7lth7kp8g.cloudfront.net/
```

Although it might change in the future, so it's best to pull full URL from `url` property on media object itself.

## Chat media

Media uploaded directly to DMs are accessible by this URL:

```
/{uploaderProfileId}/{mediaHash}?Expires={unixTimestampSeconds}&Signature={signature}&Key-Pair-Id={keyPairId}
```

## MediaState

Public media in Grindr undergo through an automated moderation check before they appear in profile. State can be either `null` for medias uploaded privately ([chats](/grindr-api/messaging/albums#upload-media-to-an-album)) or one of below for public-facing media.

- `Pending` — awaiting moderation check

WIP

