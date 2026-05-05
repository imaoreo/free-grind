# Messages

## Message

- `messageId` — string, appears to be a unix timestamp in milliseconds and UUIDv4 separated by `:`, e.g. `"1774296692000:843daee8-1e93-47d6-bc7f-3d981925a393"`
- `conversationId` — string, see [Conversation](/grindr-api/messaging/conversations#conversation)
- `senderId` — number
- `timestamp` — unix timestamp in milliseconds, appears to be same as in `messageId`
- `unsent` — boolean, if this is true, `body` is set to `null`
- `reactions` — array of objects
  - `profileId` — integer
  - `reactionType` — integer (`1` is "🔥")
- `type` — string, see [Message type](#message-type)
- `body` — object with [Message contents](#message-contents)
- `replyToMessage` — unknown or `null`
- `dynamic` — boolean, unknown purpose, WIP
- `chat1Type` — string, see [Message type](#message-type)
- `replyPreview` — unknown or `null`

## Message type

- `"Album"`
- `"AlbumContentReaction"`
- `"AlbumContentReply"`
- `"Audio"`
- `"ExpiringAlbum"`
- `"ExpiringAlbumV2"`
- `"ExpiringImage"`
- `"Video"`
- `"Gaymoji"`
- `"Generative"`
- `"Giphy"`
- `"Image"`
- `"Location"`
- `"PrivateVideo"`
- `"ProfileLink"`
- `"ProfilePhotoReply"`
- `"Retract"`
- `"Text"`
- `"Unknown"`
- `"NonExpiringVideo"`
- `"VideoCall"`

There also appears to be a related `chat1Type`, could be legacy type.

Possible values:

- `"map"`
- `"image"`
- `"expiring_album"`
- `"expiring_image"`
- `"private_video"`
- `"expiring_video"`
- `"gaymoji"`
- `"giphy"`
- `"audio"`
- `"video_call"`
- `"video_call_v3"`
- `"audio_call"`
- `"text"`
- `"unknown"`
- `"retracted"`
- `"retracted_location"`
- `"album_share"`
- `"album_react"`
- `"album_content_reaction"`
- `"album_content_reply"`

## Message contents

Payload in [`body`](#message) based on [message's `type`](#message-type), might be `null` for [unsent](#unsend-a-message) messages.

### `"Album"`

- *everything from [AlbumPreview](/grindr-api/messaging/albums#albumpreview)*
- *everything from [AlbumExpiration](/grindr-api/messaging/albums#albumexpiration)*
- `coverUrl` — [AlbumCoverUrl](/grindr-api/messaging/albums#AlbumCoverUrl)
- `ownerProfileId` — number or `null` if album has expired or was locked
- `isViewable` — boolean
- `hasVideo` — boolean
- `hasPhoto` — boolean
- `viewableUntil` — number or `null`

### `"ExpiringAlbum"`

- *everything from ["Album" message type](#album)*

### `"ExpiringAlbumV2"`

For [AlbumExpirationType](/grindr-api/messaging/albums#albumexpirationtype) = `ONCE` but might have other values if expiration settings were changed later.

- *everything from ["ExpiringAlbum" message type](#expiringalbum)*

### `"AlbumContentReaction"`

Implies "🔥" reaction as there does not appear to be any choice.

- `albumId` — integer
- `ownerProfileId` — integer or `null` if album has expired or was locked
- `albumContentId` — integer
- `previewUrl` — string or `null` if album has expired or was locked, see [Signed CDN files -> Chat media](/grindr-api/media/signed-cdn-files#chat-media)
- `expiresAt` — unix timestamp in milliseconds or `null`
- `viewable` — boolean

### `"AlbumContentReply"`

- *everything from ["AlbumContentReaction" message type](#albumcontentreaction)*
- `albumContentReply` — string
- `contentType` — string or `null` if album has expired or was locked

### `"Audio"`

- `mediaId` — number
- `mediaHash` — string or `null`
- `url` — string, see [Signed CDN files -> Chat media](/grindr-api/media/signed-cdn-files#chat-media)
- `contentType` — string, e.g. `audio/aac`
- `length` — number in milliseconds (1/1000th of a second) or `null`
- `expiresAt` — unix timestamp in milliseconds, 15 minutes

### `"Video"`

- `mediaId` — number or `null`
- `url` — string or `null`
- `fileCacheKey` — string
- `contentType` — string or `null`
- `length` — number
- `maxViews` — integer or `null`
- `looping` — boolean or `null`

Additionally, for expiring videos:

- `viewsRemaining` — integer, capped at `2147483647` for "unlimited" views

### `"PrivateVideo"`

- *everything from ["Video" message type](#video)*
- `viewCount` — integer

### `"NonExpiringVideo"`

Unknown, WIP

### `"Gaymoji"`

- `imageHash` — string

### `"Generative"`

Unknown, WIP

### `"Giphy"`

URLs point at `https://media0.giphy.com`

- `id` — string
- `urlPath` — string, full URL to gif file
- `stillPath` — string, single frame, URL to gif file
- `previewPath` — string
- `width` — integer
- `height` — integer
- `imageHash` — string

### `"Image"`

- `mediaId` — number
- `url` — string
- `width` — integer or `null`
- `height` — integer or `null`
- `imageHash` — string

Additionally, only for regular images:

- `takenOnGrindr` — boolean or `null`
- `createdAt` — number or `null`

### `"ChatImage"`

- `mediaId` — number
- `url` — string
- `expiresAt` — unix timestamp in milliseconds
- `takenOnGrindr` — boolean
- `createdTs` — number

### `"ExpiringImage"`

- *everything from ["Image" message type](#image)*
- `viewsRemaining` — number or `null`

### `"Location"`

- `lat` — number
- `lon` — number

### `"ProfileLink"`

Unknown, WIP

### `"ProfilePhotoReply"`

Unknown, WIP

- `imageHash` — string
- `photoContentReply` — string

### `"Retract"`

Unknown, WIP

- `targetMessageId` — string

### `"Text"`

- `text` — string

### `"VideoCall"`

WIP

Only for "status" messages:

- `result` — string or `null`, appears to have the following values: `SUCCESSFUL`, `Duration:`, `Busy`, `BUSY`, `Cancelled`, `Declined`, `DECLINED`, `Missed`, `AB_Unsupported`, `No_Answer`, `UNANSWERED`, `Lite_Unsupport`
- `videoCallDuration` — number or `null`

### `"Unknown"`

Empty type

## Get messages in a conversation

Requires [Authorization](/grindr-api/api-authorization).

Invoking this endpoint does not [mark messages as read](#mark-messages-as-read-up-to-message-id).

```
GET /v5/chat/conversation/{conversationId}/message
```

Query (optional):

- `pageKey` — optional, return messages with IDs before specified value
- `profile` — boolean (`profile=true` | `profile=` + any other value), optional

Response:

- `lastReadTimestamp` — unix timestamp in milliseconds
- `messages` — array of [Message](#message)
- `metadata` — nested object
  - `translate` — boolean
  - `hasSharedAlbums` — boolean
  - `isInAList` — boolean
- `profile` — object if `profile` query parameter is set to `true` or `null`
  - `profileId` — long integer
  - `name` — string, may be empty
  - `mediaHash` — string or `null`, see [Media](/grindr-api/media/index#media)
  - `onlineUntil` — unknown or `null`
  - `distance` — float or `null`
  - `showDistance` — boolean

## Get a single message in a conversation

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v4/chat/conversation/{conversationId}/message/{messageId}
```

Response:

- `message` — [Message](#message)

## Send a message to a conversation

Requires [Authorization](/grindr-api/api-authorization).

Please don't use this for spam. Be civil.

See also: [Send a message to a conversation via WS](/grindr-api/websocket/commands#send-a-message-to-a-conversation-via-ws)

```
POST /v4/chat/message/send
```

Body:

- `type` — string, see [Message type](#message-type)
- `target` — nested object
  - `type` — `Direct`, `Group`, `HumanWingman`
  - `targetId` — integer
- `body` — object with [Message contents](#message-contents) or `null`

Additional body fields for [websocket](/grindr-api/websocket/commands#send-a-message-to-a-conversation-via-ws) only:

- `replyToMessageId` — string or `null`, optional

When `replyToMessageId` is used in HTTP API appears to cause 400 Bad Request error.

Response:

HTTP status 201.

[Message](#message) object.

## Unsend a message

Requires [Authorization](/grindr-api/api-authorization).

Turns a message in chat into "This message was unsent."

Repeated requests are completed without errors.

```
POST /v4/chat/message/unsend
```

Body:

- `conversationId` — string
- `messageId` — string, must be sent by you

Response:

Empty.

Errors:

- 500 Internal Error if conversation or message was not found or if it wasn't sent by you

## Delete a message

Requires [Authorization](/grindr-api/api-authorization).

Deletes a message on your side. Does not delete message for other chat participant.

Repeated requests are completed without errors.

```
POST /v4/chat/message/delete
```

Body:

- `conversationId` — string
- `messageId` — string

Response:

Empty.

Errors:

- 500 Internal Error if conversation or message was not found

## Send typing indicator

Requires [Authorization](/grindr-api/api-authorization).

WIP, does not seem to work.

```
POST /v4/chatstatus/typing
```

Body:

- `conversationId` — string
- `status` — either `"Typing"` or `"Cleared"`

Response:

Empty.

Errors:

- 403 Action not permitted if conversation not found

## React to a message

Requires [Authorization](/grindr-api/api-authorization).

There is no discovered way to undo the reaction as of yet.

Repeated requests are completed without errors.

```
POST /v4/chat/message/reaction
```

Body:

- `conversationId` — string
- `messageId` — string
- `reactionType` — integer, (`1` is "🔥")

Response:

Empty.

Errors:

- 500 Internal Error if conversation or message was not found

