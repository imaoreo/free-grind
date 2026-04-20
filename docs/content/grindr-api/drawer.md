# Drawer, WIP

## DrawerMedia

- `id` — long integer
- `url` — string, URL
- `contentType` — string
- `createdTs` — unix timestamp in milliseconds
- `used` — boolean
- `takenOnGrindr` — boolean

## Get media in drawer

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v4/chat/media/drawer
```

Response:

Array of [DrawerMedia](/grindr-api/drawer#drawermedia).

## Get media in drawer for a conversation

Requires [Authorization](/grindr-api/api-authorization).

```
GET /v4/chat/media/drawer/{conversationId}
```

Array of [DrawerMedia](/grindr-api/drawer#drawermedia).

## Add media to drawer

Requires [Authorization](/grindr-api/api-authorization).

MediaId must be obtained through [uploading](/grindr-api/users/profiles#upload-media).

Repeated requests cause 500 HTTP status "Internal Error".

```
PUT /v4/chat/media/drawer/{mediaId}
```

Response:

Empty.

## Delete media from drawer

Requires [Authorization](/grindr-api/api-authorization).

Repeated requests are completed without errors.

```
DELETE /v4/chat/media/drawer/{mediaId}
```

Response:

Empty with HTTP status 202.