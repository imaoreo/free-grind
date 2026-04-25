import { useApi } from "../hooks/useApi";

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

export function useAgeVerificationService() {
	const { fetchRest } = useApi();

	async function getOptions(): Promise<AgeVerificationOptions> {
		const res = await fetchRest("/v1/age-verification/options");
		if (res.status !== 200) {
			throw new Error(`Failed to fetch age verification options: ${res.status}`);
		}
		return res.json() as AgeVerificationOptions;
	}

	async function createSession(): Promise<AgeVerificationSession> {
		const res = await fetchRest("/v1/age-verification/session", {
			method: "POST",
		});
		if (res.status !== 200) {
			throw new Error(`Failed to create age verification session: ${res.status}`);
		}
		return res.json() as AgeVerificationSession;
	}

	async function verifyLiveness3d(
		data: Liveness3dRequest,
	): Promise<AgeVerificationFaceTecResponse> {
		const res = await fetchRest("/v1/age-verification/verify/liveness3d", {
			method: "POST",
			body: data,
		});
		if (res.status !== 200) {
			throw new Error(`Liveness3d verification failed: ${res.status}`);
		}
		return res.json() as AgeVerificationFaceTecResponse;
	}

	async function verifyEnrollment(): Promise<AgeVerificationFaceTecResponse> {
		const res = await fetchRest("/v1/age-verification/verify/enrollment", {
			method: "POST",
		});
		if (res.status !== 200) {
			throw new Error(`Enrollment verification failed: ${res.status}`);
		}
		return res.json() as AgeVerificationFaceTecResponse;
	}

	async function verifyDocument(
		photoIdMatchData: Record<string, unknown>,
	): Promise<AgeVerificationFaceTecResponse> {
		const res = await fetchRest("/v1/age-verification/verify/document", {
			method: "POST",
			body: photoIdMatchData,
		});
		if (res.status !== 200) {
			throw new Error(`Document verification failed: ${res.status}`);
		}
		return res.json() as AgeVerificationFaceTecResponse;
	}

	return { getOptions, createSession, verifyLiveness3d, verifyEnrollment, verifyDocument };
}
