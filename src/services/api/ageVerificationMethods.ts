import type {
	AgeVerificationFaceTecResponse,
	AgeVerificationOptions,
	AgeVerificationSession,
	Liveness3dRequest,
} from "../../types/age-verification";
import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess } from "../apiHelpers";

export function createAgeVerificationMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async getAgeVerificationOptions(): Promise<AgeVerificationOptions> {
			const response = await fetchRest("/v1/age-verification/options");
			await assertSuccess(response, t("api.errors.age_verification_options"));
			return response.json() as AgeVerificationOptions;
		},

		async createAgeVerificationSession(): Promise<AgeVerificationSession> {
			const response = await fetchRest("/v1/age-verification/session", {
				method: "POST",
			});
			await assertSuccess(response, t("api.errors.age_verification_session"));
			return response.json() as AgeVerificationSession;
		},

		async verifyAgeLiveness3d(
			data: Liveness3dRequest,
		): Promise<AgeVerificationFaceTecResponse> {
			const response = await fetchRest("/v1/age-verification/verify/liveness3d", {
				method: "POST",
				body: data,
			});
			await assertSuccess(response, t("api.errors.liveness_failed"));
			return response.json() as AgeVerificationFaceTecResponse;
		},

		async verifyAgeEnrollment(): Promise<AgeVerificationFaceTecResponse> {
			const response = await fetchRest("/v1/age-verification/verify/enrollment", {
				method: "POST",
			});
			await assertSuccess(response, t("api.errors.enrollment_failed"));
			return response.json() as AgeVerificationFaceTecResponse;
		},

		async verifyAgeDocument(
			photoIdMatchData: Record<string, unknown>,
		): Promise<AgeVerificationFaceTecResponse> {
			const response = await fetchRest("/v1/age-verification/verify/document", {
				method: "POST",
				body: photoIdMatchData,
			});
			await assertSuccess(response, t("api.errors.document_failed"));
			return response.json() as AgeVerificationFaceTecResponse;
		},
	};
}
