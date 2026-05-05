import { GRINDAPI_BASE, registerPresence, trackUpdateCheck } from "../apiHelpers";
import { hasAnalyticsConsent } from "../../utils/analyticsConsent";

export function createPresenceMethods() {
	return {
		async registerPresence(profileId: string | number): Promise<void> {
			await registerPresence(profileId);
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
				const response = await fetch(`${GRINDAPI_BASE}/api/presence/check?${query}`, {
					method: "GET",
				});

				if (!response.ok) {
					console.warn(
						`Failed to check presence: ${response.status} ${response.statusText}`
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
			await trackUpdateCheck(data);
		},
	};
}
