# Legal agreements, WIP

- DELETE /v5/legal-agreements/subscriber-sponsored-content SponsoredContentAcceptConsentRequest (yes, with body)
- POST /v5/legal-agreements/subscriber-sponsored-content SponsoredContentAcceptConsentRequest
- GET /v5/legal-agreements/subscriber-sponsored-content . SponsoredContentConsentAgreementResponse
- POST /v1/agreements/ban BanAgreementRequest

- GET /v3/me/legal-agreements . AcceptedLegalAgreementsResponse
- DELETE /v5/legal-agreements/vip-matchmaker VipMatchmakerAcceptConsentRequest
- GET /v5/legal-agreements/vip-matchmaker . VipMatchmakerConsentAgreementResponse
- POST /v5/legal-agreements/vip-matchmaker VipMatchmakerAcceptConsentRequest
- DELETE /v4/legal-agreements/top-picks
- GET /v5/legal-agreements/top-picks . TopPicksConsentAgreementResponse
- GET /v4/legal-agreements/right-now . RightNowConsentAgreementResponse
- DELETE /v5/legal-agreements/top-picks TopPicksAcceptConsentRequest
- PUT /v3/me/legal-agreements AcceptLegalAgreementsRequest
- POST /v4/legal-agreements/right-now RightNowAcceptConsentRequest
- POST /v4/legal-agreements/top-picks TopPicksAcceptConsentRequest
- GET /v4/legal-agreements/top-picks . TopPicksConsentAgreementResponse
- GET /v3/legal-agreements . LegalAgreementsInfo

- PUT /v1/opt-out ConsentRequest
- DELETE /v1/opt-out ConsentRequest (body)
- POST /v1/opt-out ConsentRequest ConsentOptStatusResponse

