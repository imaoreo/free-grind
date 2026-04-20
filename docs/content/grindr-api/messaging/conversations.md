# Conversations

## Conversation ID

String with two long integers separated by `:`, e.g. `"12345678:23456789"`. Long integers are IDs of [Profile](/grindr-api/users/profiles#profile). The order of these IDs is always from smaller ID to higher ID, regardless of who started the chat.

## Conversation

- `type` — string, e.g. `"full_conversation_v1"`
- `data` — nested object
  - `conversationId` — [Conversation ID](#conversation-id)
  - `name` — string, profile name, may be an empty string, e.g. `""`
  - `participants` — array of objects
    - `profileId` — integer, [Profile ID](/grindr-api/users/profiles#profilemin)
    - `primaryMediaHash` — string or `null`, see [Media -> Public CDN files](/grindr-api/media/public-cdn-files)
    - `lastOnline` — unix timestamp in milliseconds
    - `onlineUntil` — unix timestamp in milliseconds or `null`
    - `distanceMetres` — float number or `null`
    - `position` — [Sexual position ID](/grindr-api/users/profiles#sexual-position-id) or `null`
    - `isInAList` — boolean
    - `hasDatingPotential` — boolean
  - `lastActivityTimestamp` — unix timestamp in milliseconds
  - `unreadCount` — integer
  - `preview` — nested object
    - `conversationId` — nested object
        - `value` — [Conversation ID](#conversation-id)
    - `messageId` — string, see [Message](/grindr-api/messaging/messages#message) for format
    - `chat1MessageId` — string with UUIDv4, second part of `messageId`
    - `senderId` — integer, [Profile ID](/grindr-api/users/profiles#profilemin)
    - `type` — [Message type](/grindr-api/messaging/messages#message-type)
    - `chat1Type` — string, see [Message type](/grindr-api/messaging/messages#message-type)
    - `text` — string or `null`, message text
    - `url` — unknown, appears to be `null`
    - `lat` — unknown, appears to be `null`
    - `lon` — unknown, appears to be `null`
    - `albumId` — integer, appears to be `null`
    - `albumContentId` — unknown, appears to be `null`
    - `albumContentReply` — unknown, appears to be `null`
    - `duration` — unknown, appears to be `null`
    - `imageHash` — unknown, appears to be `null`
    - `photoContentReply` — unknown, appears to be `null`
  - `muted` — boolean
  - `pinned` — boolean
  - `favorite` — boolean
  - `context` — unknown, appears to be `null`
  - `onlineUntil` — unknown, appears to be `null`
  - `translatable` — boolean
  - `rightNow` — string, e.g. `"NOT_ACTIVE"`
  - `hasUnreadThrob` — boolean

## Get conversations

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/inbox
```

*Also `POST /v3/inbox`, seems to be aliased to v4 now*

Query (optional):

- `page` — 1-based number, pagination

Body (optional):

- `unreadOnly` — boolean
- `chemistryOnly` — boolean
- `favoritesOnly` — boolean
- `rightNowOnly` — boolean
- `onlineNowOnly` — boolean
- `distanceMeters` — "double" number value or `null`
- `positions` — array of integers, [sexual position IDs](/grindr-api/users/profiles#sexual-position-id)

Response:

- `entries` — array of [Conversation](#conversation)
- `showsFreeHeaderLabel` — boolean
- `totalFullConversations` — number, e.g. `"5"`
- `totalPartialConversations` — number, e.g. `0`
- `maxDisplayLockCount` — number, e.g. `99`
- `nextPage` — integer, e.g. `2`

## Get conversations by IDs

```
POST /v1/inbox/conversation
```

Body: 
- Array of [Conversation IDs](#conversation-id)

Response (array):
- `conversationId` - string, e.g. `647135273:771038429`
- `name` - string, profile name, may be an empty string, e.g. `""`
- `participants` - array of objects
    - `profileId` - integer, [Profile ID](/grindr-api/users/profiles#profilemin)
    - `primaryMediaHash` - string or `null`, see [Media -> Public CDN files -> Profile Images](/grindr-api/media/public-cdn-files#profile-images)
    - `lastOnline` - unix timestamp in milliseconds
    - `distanceMetres` - float number or `null`
  - `lastActivityTimestamp` - unix timestamp in milliseconds
  - `unreadCount` - integer
  - `preview` - nested object
    - `conversationId` - nested object
      - `value` - [Conversation ID](#conversation-id)
    - `messageId` - string, see [Message](/grindr-api/messaging/messages#message) for format
    - `chat1MessageId` - string with UUIDv4, second part of `messageId`
    - `senderId` - integer, [Profile ID](/grindr-api/users/profiles#profilemin)
    - `type` - [Message type](/grindr-api/messaging/messages#message-type)
    - `chat1Type` - string, see [Message type](/grindr-api/messaging/messages#message-type)
    - `text` - string or `null`, message text
    - `url` - unknown, appears to be `null`
    - `lat` - unknown, appears to be `null`
    - `lon` - unknown, appears to be `null`
    - `albumId` - integer, appears to be `null`
    - `albumContentId` - unknown, appears to be `null`
    - `albumContentReply` - unknown, appears to be `null`
    - `duration` - unknown, appears to be `null`
    - `imageHash` - unknown, appears to be `null`
    - `photoContentReply` - unknown, appears to be `null`
  - `muted` - boolean
  - `pinned` - boolean
  - `favorite` - boolean
  - `context` - unknown, appears to be `null`
  - `onlineUntil` - unknown, appears to be `null`
  - `translatable` - boolean
  - `rightNow` - string, e.g. `"NOT_ACTIVE"`
  - `hasUnreadThrob` - boolean
  

## Delete a conversation

Requires [Authorization](/grindr-api/api-authorization).

Deletes the conversation on your side. Does not delete the conversation for other chat's participant.

Repeated requests are completed without errors.

```
DELETE /v4/chat/conversation/{conversationId}
```

Response:

Empty.

## Pin a conversation

Requires [Authorization](/grindr-api/api-authorization).

Affects sorting position in [list conversations](#list-conversations) endpoint response.

Repeated requests are completed without errors. Requests on nonexistent conversations seem to be affecting them after they have been created.

```
POST /v4/chat/conversation/{conversationId}/pin
```

No body.

Response:

Empty.

## Unpin a conversation

Requires [Authorization](/grindr-api/api-authorization).

Affects sorting position in [list conversations](#list-conversations) endpoint response. Requests on nonexistent conversations seem to be affecting them after they have been created.

Repeated requests are completed without errors.

```
POST /v4/chat/conversation/{conversationId}/unpin
```

No body.

Response:

Empty.

## Mute a conversation

Requires [Authorization](/grindr-api/api-authorization).

Requests on nonexistent conversations seem to be affecting them after they have been created.

Repeated requests are completed without errors.


```
POST /v1/push/conversation/{conversationId}/mute
```

No body.

Response:

Empty

## Unmute a conversation

Requires [Authorization](/grindr-api/api-authorization).

Requests on nonexistent conversations seem to be affecting them after they have been created.

Repeated requests are completed without errors.

```
POST /v1/push/conversation/{conversationId}/unmute
```

No body.

Response:

Empty

## Get shared media in conversation

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v5/chat/media/shared/images/with-me/{conversationId}
```

Response:

- `images` - array of [ChatImage](/grindr-api/messaging/messages#chatimage)

## Refresh messages

Requests the messages from the message id

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/chat/conversation/{conversationId}/message-by-id
```

Body:

- `messageIds` — array of strings

Response:

- `messages` — array of [Message](/grindr-api/messaging/messages#message)

## Mark messages as read

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v4/chat/conversation/{conversationId}/read/{messageId}
```

Regardless of messageId passed, the whole conversation's [`unreadCount`](#conversation) will be reset to 0. messageId is taken into account to present the "Read" label to sender.

If you'd like to mark conversation as read but don't show it to other participant, you could pass a valid but nonexistent messageId, such as `0:00000000-0000-0000-0000-000000000000`.

Invalid messageIds will cause HTTP status 400 Bad Request errors.

No body.

Response:

Empty.

## AI chat suggestions

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/chat/suggestions
```

Query:

- `conversationId` — string

Response:

- `suggestions` — array of objects
  - `id` — UUIDv3
  - `text` — string
  - `type` — `SAVED_PHRASE` | `SMART_PHRASE`

## Chat AI summary feedback, WIP

POST /v1/chat/summary/feedback WingmanSummaryFeedbackDto 

