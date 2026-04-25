# Age verification, WIP

Help needed.

## Verify Document

Requires [Authorization](/grindr-api/api-authorization).

```
POST /v1/age-verification/verify/document
```

Response:

## Session
Requires [Authorization](/grindr-api/api-authorization).

```
POST /v1/age-verification/session
```

Response:
- `sessionId` — string

Response:

## Enrollment
Requires [Authorization](/grindr-api/api-authorization).

```
POST /v1/age-verification/verify/enrollment
```

Response:
- `method` — string
- `responseBlob` - string
- `status` - string
  
## Liveness 3D
Requires [Authorization](/grindr-api/api-authorization).\

```
POST /v1/age-verification/verify/liveness3d
```

Request:
- `faceTecUserAgent` — string, the FaceTecAPIUserAgentString described below
- `faceScan` — string, base64 encoded FaceTecSDK.createFaceScanResultBlob() result
- `auditTrailImage` — string, base64 encoded FaceTecSDK.getAuditTrailCompressedJpeg() result
- `lowQualityAuditTrailImage` — string, base64 encoded FaceTecSDK.getLowQualityAuditTrailCompressedJpeg() result

Response:
- `method` — string
- `responseBlob` - string
- `status` - string


## Options
Requires [Authorization](/grindr-api/api-authorization).

```
GET /v1/age-verification/options
```

Response:
- `methods` — array of strings
- `faceTecConfig` — object
  - `deviceKeyIdentifier` — string
  - `encryptionKey` — string
  - `sdkKey`
  
example response:
```json
{
    "methods": [],
    "faceTecConfig": {
        "deviceKeyIdentifier": "dIdmLmkFuCs0QpFcWJhVC1j2NNUJX5b4",
        "encryptionKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5PxZ3DLj+zP6T6HFgzzk\nM77LdzP3fojBoLasw7EfzvLMnJNUlyRb5m8e5QyyJxI+wRjsALHvFgLzGwxM8ehz\nDqqBZed+f4w33GgQXFZOS4AOvyPbALgCYoLehigLAbbCNTkeY5RDcmmSI/sbp+s6\nmAiAKKvCdIqe17bltZ/rfEoL3gPKEfLXeN549LTj3XBp0hvG4loQ6eC1E1tRzSkf\nGJD4GIVvR+j12gXAaftj3ahfYxioBH7F7HQxzmWkwDyn3bqU54eaiB7f0ftsPpWM\nceUaqkL2DZUvgN0efEJjnWy5y1/Gkq5GGWCROI9XG/SwXJ30BbVUehTbVcD70+ZF\n8QIDAQAB\n-----END PUBLIC KEY-----",
        "sdkKey": "appId       = \"com.grindrapp.android,com.grindrguy.grindrx,com.grindrguy.grindrx.debug\"\nexpiryDate  = 2026-07-10\nkey        = 00304502203691f4762b843ce91802082db5fbece44b4360aa9093a8dcd0a962730023cd62022100bf55cc9c08dbfa8834feb30291b265d720119f271d17dc8a9835020fdc60ed8b"
    }
}```

- POST /v1/age-verification/verify/document AgeVerificationPhotoIdMatchRequest AgeVerificationFaceTecResponse
- POST /v1/age-verification/session . AgeVerificationSessionResponse
- POST /v1/age-verification/verify/enrollment . AgeVerificationFaceTecResponse
- POST /v1/age-verification/verify/liveness3d AgeVerificationFaceTecRequest AgeVerificationFaceTecResponse
- GET /v1/age-verification/options . AgeVerificationOptionsResponse AgeVerificationOptionsResponse

## FaceTecAPIUserAgentString
This is a string used in some of the API calls, it is for verify what agent was used.

A example of a string is facetec|sdk|android|3.0.0|com.grindr.faceliveness|Pixel 4a|10|en-US|en|3.0.0

StringBuilder sb = new StringBuilder("facetec|sdk|android|");
sb.append(f27209h);
sb.append("|");
sb.append("f");
sb.append("|");
sb.append(strE); strE can js be "_"
sb.append("|");
sb.append(Build.MODEL);
sb.append("|");
sb.append(FaceTecSDK.version());
sb.append("|");
sb.append(Locale.getDefault());
sb.append("|");
sb.append(Locale.getDefault().getLanguage());
sb.append("|");
sb.append(str); // THIS IS A INPUT PASSED TO THE FUNCTION
return sb.toString();
