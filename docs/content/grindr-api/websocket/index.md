<script setup>
import { grindrApiReferenceWebSocket as subpages } from '$lib'
</script>

# WebSocket

WebSocket URL:

```
wss://grindr.mobi/v1/ws
```

Only [Authorization](/grindr-api/api-authorization) and [User-Agent](/grindr-api/security-headers#user-agent) are required in the connection request. Expired authorization tokens do not cause connection to be closed, although attempting to use such expired token with a [command](#websocket-command-request) will result in it being closed by server with status code 4401.

Upon successful connection, a [`ws.connection.established`](#wsconnectionestablished) event is received by client.

<Subpages :items="subpages" />