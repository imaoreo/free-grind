<script setup>
import { grindrApiReferenceMedia as subpages } from '$lib'
</script>

# Media

Media files in Grindr are stored on cdns.grindr.com:443 hosted by Amazon CloudFront powered by AmazonS3. All CDN files are accessible without [authorization](/grindr-api/api-authorization) but some are protected with signed URLs. No [security headers](/grindr-api/security-headers) or `Authorization` need to be present in reuqest to CDN.

Caching is supported via [ETag header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) — MD5 hash of image file. Image files might have `image/jpeg`, `image/png` or `image/webp` type, based on original.

Media files are identified by either a 40-character (public files) or 64-character (signed files) hexademical string. Although not confirmed for all types of media, it appears to be SHA-1 hash for 40-character hash and SHA-256 hash for 64-character hash. Confirmed cases: [Audio](/grindr-api/messaging/messages#audio) uses SHA-256 for its 64-character mediaHash.

There are two types of files stored on CDN.

<Subpages :items="subpages" />