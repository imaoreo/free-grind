# Spotify

## Get Spotify favorites profile ID, WIP

```
GET /v4/spotify/favorites/{profileId}
```

Response: SpotifyBackendResponse

## Post Spotify favorites, WIP

```
POST /v4/spotify/favorites
```

Body: SpotifyPostRequest, WIP

## Auth, WIP

`grant_type` string, `refresh_token` string
| `grant_type` string, `code` string, `redirect_uri` string
| `grant_type` string

## Tracks, WIP

- GET /v1/search?q=string&type=string . SpotifySearchTrackResponse
- GET /v1/tracks?ids=string . SpotifyGetTrackResponse
- GET /v1/me/player/recently-played . SpotifyRecentlyPlayedResponse

