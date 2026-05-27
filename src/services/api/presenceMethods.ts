import type { RestFetcher } from "../../types/chat-service";
import { GRINDAPI_BASE, registerPresence, trackUpdateCheck } from "../apiHelpers";
import { hasAnalyticsConsent } from "../../utils/analyticsConsent";

export function createPresenceMethods(fetchRest?: RestFetcher) {
	return {
		async registerPresence(profileId: string | number): Promise<void> {
			await registerPresence(profileId, fetchRest);
		},

		async checkPresence(
			profileIds: string | number | (string | number)[]
		): Promise<Record<string, boolean>> {
			if (!hasAnalyticsConsent()) {
				return {};
			}

			const ids = Array.isArray(profileIds)
				? profileIds.map(String)
				: [String(profileIds)];

			if (ids.length > 50) {
				console.warn("checkPresence: truncating to 50 IDs (received " + ids.length + ")");
				ids.length = 50;
			}

			try {
				const query = new URLSearchParams({ ids: ids.join(",") });
				const url = `${GRINDAPI_BASE}/api/presence/check?${query}`;

				const response = fetchRest
					? await fetchRest(url, { method: "GET" })
					: await fetch(url, { method: "GET" });

				if (response.status !== 200) {
					console.warn(
						`Failed to check presence: ${response.status}`
					);
					return {};
				}

				return (await response.json()) as Record<string, boolean>;
			} catch (error) {
				console.warn("Presence check error:", error);
				return {};
			}
		},

		async trackUpdateCheck(data: {
			channel: string;
			platform: string;
			arch: string;
			version: string;
			appVersion: string;
		}): Promise<void> {
			await trackUpdateCheck(data, fetchRest);
		},
	};
}
