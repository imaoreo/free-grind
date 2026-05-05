import type { RestResponse } from "../types/chat-service";
import { hasAnalyticsConsent } from "../utils/analyticsConsent";

export class ApiFunctionError extends Error {
	status: number;
	payload: unknown;

	constructor(message: string, status: number, payload: unknown) {
		super(message);
		this.name = "ApiFunctionError";
		this.status = status;
		this.payload = payload;
	}
}

export const GRINDAPI_BASE = "https://grindapi.imaoreo.dev";

const ISSUES_API_BASE =
	import.meta.env.VITE_ISSUES_API_BASE ||
	import.meta.env.VITE_GRINDAPI_BASE_URL ||
	GRINDAPI_BASE;

export async function parseJsonSafe(response: RestResponse): Promise<unknown> {
	try {
		return response.json();
	} catch {
		return null;
	}
}

export async function assertSuccess(response: RestResponse, fallbackMessage: string) {
	if (response.status >= 200 && response.status < 300) {
		return;
	}

	const payload = await parseJsonSafe(response);
	const message =
		typeof payload === "object" &&
		payload !== null &&
		"message" in payload &&
		typeof (payload as { message?: unknown }).message === "string"
			? ((payload as { message: string }).message || fallbackMessage)
			: fallbackMessage;

	throw new ApiFunctionError(message, response.status, payload);
}

export async function submitIssueReport(
	data: {
		kind: "BUG" | "FEATURE";
		title: string;
		description: string;
		reporterName?: string;
		reporterContact?: string;
		appVersion?: string;
		platform?: string;
		otaChannel?: string;
		clientLogs?: Record<string, unknown>;
	},
	t: (key: string) => string,
): Promise<{ id: string }> {
	const response = await fetch(`${ISSUES_API_BASE}/api/issues/submit`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(data),
	});

	let payload: { id?: string; error?: string } | null = null;
	try {
		payload = (await response.json()) as { id?: string; error?: string };
	} catch {
		payload = null;
	}

	if (!response.ok) {
		throw new ApiFunctionError(
			payload?.error || t("issues_form.submit_error"),
			response.status,
			payload,
		);
	}

	if (!payload?.id) {
		throw new ApiFunctionError(t("issues_form.no_id_error"), 500, payload);
	}

	return { id: payload.id };
}

export async function trackUpdateCheck(data: {
	channel: string;
	platform: string;
	arch: string;
	version: string;
	appVersion: string;
}): Promise<void> {
	if (!hasAnalyticsConsent()) {
		return;
	}

	try {
		const response = await fetch(`${GRINDAPI_BASE}/api/analytics/track-update`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			console.warn(
				`Failed to track update check: ${response.status} ${response.statusText}`
			);
		}
	} catch (error) {
		console.warn("Update tracking error:", error);
	}
}

export async function registerPresence(profileId: string | number): Promise<void> {
	if (!hasAnalyticsConsent()) {
		return;
	}

	try {
		const response = await fetch(`${GRINDAPI_BASE}/api/presence/register`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				profileId: String(profileId),
			}),
		});

		if (!response.ok) {
			console.warn(
				`Failed to register presence: ${response.status} ${response.statusText}`
			);
		}
	} catch (error) {
		console.warn("Presence registration error:", error);
	}
}
