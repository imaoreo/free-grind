import type { RestFetcher, RestResponse } from "../types/chat-service";
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

export async function parseJsonSafe(response: RestResponse | Response): Promise<unknown> {
	try {
		return response.json();
	} catch {
		return null;
	}
}

export async function assertSuccess(response: RestResponse | Response, fallbackMessage: string) {
	const status = "status" in response ? response.status : (response as Response).status;
	if (status >= 200 && status < 300) {
		return;
	}

	const payload = await parseJsonSafe(response);
	let message = fallbackMessage;

	if (payload && typeof payload === "object") {
		const p = payload as Record<string, unknown>;
		if (typeof p.message === "string" && p.message) {
			message = p.message;
		} else if (typeof p.error === "string" && p.error) {
			message = p.error;
		}
	}

	throw new ApiFunctionError(message, status, payload);
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
	fetchRest?: RestFetcher
): Promise<{ id: string }> {
	const url = `${ISSUES_API_BASE}/api/issues/submit`;
	const options = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(data),
	};

	const response = fetchRest
		? await fetchRest(url, { ...options, body: data })
		: await fetch(url, options);

	let payload: { id?: string; error?: string } | null = null;
	try {
		payload = (await response.json()) as { id?: string; error?: string };
	} catch {
		payload = null;
	}

	const ok = "status" in response ? (response.status >= 200 && response.status < 300) : (response as Response).ok;
	if (!ok) {
		throw new ApiFunctionError(
			payload?.error || t("issues_form.submit_error"),
			"status" in response ? response.status : (response as Response).status,
			payload,
		);
	}

	if (!payload?.id) {
		throw new ApiFunctionError(t("issues_form.no_id_error"), 500, payload);
	}

	return { id: payload.id };
}

export type IssueStatus = "OPEN" | "IN_PROGRESS" | "CLOSED" | "RESOLVED";
export type IssueCategory = "BUG" | "FEATURE_REQUEST";

export type IssueResult = {
	id: string;
	title: string;
	description: string;
	status: IssueStatus;
	priority: string;
	category: IssueCategory;
	createdAt: string;
	updatedAt: string;
	reportedBy: { id: string; name: string } | null;
};

export type SearchIssuesParams = {
	search?: string;
	category?: IssueCategory;
	status?: IssueStatus;
	skip?: number;
	take?: number;
};

export async function searchIssues(params: SearchIssuesParams): Promise<{
	data: IssueResult[];
	total: number;
	skip: number;
	take: number;
}> {
	const query = new URLSearchParams();
	if (params.search) query.set("search", params.search);
	if (params.category) query.set("category", params.category);
	if (params.status) query.set("status", params.status);
	if (params.skip !== undefined) query.set("skip", String(params.skip));
	if (params.take !== undefined) query.set("take", String(params.take));

	const response = await fetch(`${ISSUES_API_BASE}/api/issues?${query.toString()}`);
	if (!response.ok) {
		throw new Error("Failed to load issues");
	}

	return response.json() as Promise<{ data: IssueResult[]; total: number; skip: number; take: number }>;
}

export async function trackUpdateCheck(data: {
	channel: string;
	platform: string;
	arch: string;
	version: string;
	appVersion: string;
}, fetchRest?: RestFetcher): Promise<void> {
	if (!hasAnalyticsConsent()) {
		return;
	}

	try {
		const url = `${GRINDAPI_BASE}/api/analytics/track-update`;
		const response = fetchRest
			? await fetchRest(url, { method: "POST", body: data })
			: await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(data),
			});

		const status = "status" in response ? response.status : (response as Response).status;
		if (status < 200 || status >= 300) {
			console.warn(
				`Failed to track update check: ${status}`
			);
		}
	} catch (error) {
		console.warn("Update tracking error:", error);
	}
}

export async function registerPresence(profileId: string | number, fetchRest?: RestFetcher): Promise<void> {
	if (!hasAnalyticsConsent()) {
		return;
	}

	try {
		const url = `${GRINDAPI_BASE}/api/presence/register`;
		const body = {
			profileId: String(profileId),
		};
		const response = fetchRest
			? await fetchRest(url, { method: "POST", body })
			: await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});

		const status = "status" in response ? response.status : (response as Response).status;
		if (status < 200 || status >= 300) {
			console.warn(
				`Failed to register presence: ${status}`
			);
		}
	} catch (error) {
		console.warn("Presence registration error:", error);
	}
}
