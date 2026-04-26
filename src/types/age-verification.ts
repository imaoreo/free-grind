export interface AgeVerificationOptions {
	methods: string[];
	faceTecConfig: {
		deviceKeyIdentifier: string;
		encryptionKey: string;
		sdkKey: string;
	};
}

export interface AgeVerificationSession {
	sessionId: string;
}

export interface AgeVerificationFaceTecResponse {
	method: string;
	responseBlob: string;
	status: string;
}

export interface Liveness3dRequest {
	faceTecUserAgent: string;
	faceScan: string;
	auditTrailImage: string;
	lowQualityAuditTrailImage: string;
}

export type VerificationStep =
	| "loading-options"
	| "select-method"
	| "starting-session"
	| "face-scan"
	| "submitting"
	| "success"
	| "error";
