# Commands

WebSocket API supports commands that mimic HTTP requests.

All requests must have these fields in addition to any top-level properties specified for each request type:

- `type` — string, command type, e.g. `chat.v1.message.send`
- `ref` — [WebSocket command ref](#websocket-command-ref)
- `token` — string, [Session ID](/grindr-api/authentication#session-id)

Invalid or expired tokens passed in token field cause socket closing with status code 4401.

## WebSocket command ref

String, required in each command.

Used to identify responses to concurrent requests.

**It's imperative that you use a different ref for each request, as responses seem to be cached/requests skipped.** Does not have any limits on length or disallowed characters. `null` values are not allowed as input. Any other value is coerced into string.

## WebSocket command response

Command response is an [event](/grindr-api/websocket/events) sent with `type` property value being `[command].response`.

Additionally, responses have the following fields:

- `status` — HTTP status code for this response
- `ref` — [WebSocket command ref](#websocket-command-ref)
- `payload` — object, result of request

Response's `payload` usually mirrors the response of HTTP API endpoint.

## Send a message to a conversation via WS

```
chat.v1.message.send
```

- `payload` — body of [Send a message to a conversation](/grindr-api/messaging/messages#send-a-message-to-a-conversation)

[Response](#websocket-command-response):

See: [HTTP API -> Send a message to a conversation](/grindr-api/messaging/messages#send-a-message-to-a-conversation)

