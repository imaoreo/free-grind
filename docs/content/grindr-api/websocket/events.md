# Events

Events are formatted as a compact JSON object that has a `type` string property and other top-level properties defined below, different for each event type.

## `ws.connection.established`

Connection established. Sent by server automatically as soon as the WebSocket is opened.

- `timestamp` — unix timestamp in milliseconds

## `ws.error`

Response to a command, generic error.

- `message` — e.g. `"Could not convert frame to command"`

