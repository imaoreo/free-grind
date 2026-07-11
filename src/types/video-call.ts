// channelId/token/maxSeconds come back null on a "soft failure" — HTTP 2xx
// but result !== "SUCCESS" (e.g. "EXCEED_LENGTH_LIMIT" when the account's
// daily/monthly video call allowance is used up).
export interface StartVideoCallResult {
	result: string;
	channelId: string | null;
	token: string | null;
	maxSeconds: number | null;
	message: string | null;
}

// GET /v3/video-call — remaining allowance for the current period (daily for
// Free, monthly for XTRA/Unlimited).
export interface VideoCallInfoResult {
	remainingSeconds: number;
}

// PATCH /v1/video-call — renews the Agora token for the caller's own active
// call (identified server-side via session, no body/channelId needed).
// refreshSeconds is the server's recommended lead time before expiry to call
// this again (observed: 300s / 5 minutes).
export interface RenewVideoCallResult {
	result: string;
	token: string | null;
	remainingSeconds: number | null;
	refreshSeconds: number | null;
	message: string | null;
}
