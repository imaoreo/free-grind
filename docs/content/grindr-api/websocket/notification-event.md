# Notification Event

All notifications include the following fields:

- `notificationId` — UUIDv4 or `null`
- `ref` — always `null` for notifications

## `chat.v1.message_sent`

Message received, sent, unsent or got reaction.

- *everything from [Notification Event](#notification-event)*
- `payload` — [Message](/grindr-api/messaging/messages#message)

## `chat.v1.refresh_dynamic`

Album shared, unshared, expiration settings changed or viewed.

- *everything from [Notification Event](#notification-event)*
- `payload` — object
  - `conversationId` — [Conversation ID](/grindr-api/messaging/conversations#conversation-id)
  - `messageType` — [Message Type](/grindr-api/messaging/messages#message-type)

## `tap.v1.tap_sent`

Tap received or sent.

- *everything from [Notification Event](#notification-event)*
- `payload` — object
  - `timestamp`
  - `senderId`
  - `recipientId`
  - `tapType`
  - `senderProfileImageHash`
  - `senderDisplayName`
  - `isMutual`

## `chat.v1.conversation.delete`

Conversation deleted, e.g. when another profile blocked you. Also fires for unlock events.

- *everything from [Notification Event](#notification-event)*
- `payload` — object
  - `conversationIds` — array of [Conversation ID](/grindr-api/messaging/conversations#conversation-id)

## `chat.v1.message.ack`

WIP

## `notification.undelivered`

WIP

## `chat.v1.typing.start`

WIP

## `chat.v1.typing.stop`

WIP

## `viewed_me.v1.new_view_received`

New view received, e.g. when another profile views your profile.

- *everything from [Notification Event](#notification-event)*
- `payload` — object
  - `viewedCount` — total number of profiles that viewed you, including the most recent one
  - `mostRecent` — object
    - `profileId` — ID of the profile that viewed
    - `photoHash` — hash of the profile photo, if available
    - `timestamp` — unix timestamp in milliseconds of the view

