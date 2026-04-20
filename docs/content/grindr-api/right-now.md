# Right Now

WIP

## RightNowStatus

- `NOT_ACTIVE`
- `HOSTING`
- `NOT_HOSTING`

## Right Now methods, WIP

- GET /v3/rightnow/active-post . RightNowGetActivePostResponse
- GET /v3/rightnow/profiles/{profileId} . RightNowGetOtherUserPostResponse
- PATCH /{version}/rightnow/posts/{postId} UpdatePostRequest
- POST /v4/rightnow/posts CreatePostRequest RightNowCreatePostResponse
- POST /v3/rightnow/posts CreatePostRequest RightNowCreatePostResponse
- PATCH /v1/rightnow/posts/{postId}/settings UpdatePostSettingsRequest
- GET /v5/rightnow/feed?sort=RightNowSortOption&hosting=boolean&ageMin=integer&ageMax=integer&sexualPositions=string . RightNowGetFeedResponse
- POST /v1/media/upload?img_1_bottom=integer&img_1_left=integer&img_1_right=integer&img_1_top=integer binary RightNowMediaUploadResponse
- GET /v1/rightnow/googleplay/sku . RightNowSkuResponse
- POST /v1/rightnow/requests RightNowCreateRequestData

