import { getCurrentHotswapChannel } from "../services/hotswap";
import { getRecentAppLogs } from "./logger";

const ISSUE_LOG_LIMIT = 100;

export function detectClientPlatform(): string {
	const ua = navigator.userAgent.toLowerCase();
	const nav = navigator as Navigator & {
		userAgentData?: { platform?: string };
	};
	const uaDataPlatform =
		typeof nav.userAgentData?.platform === "string"
			? nav.userAgentData.platform.toLowerCase()
			: "";
	const base = uaDataPlatform || ua;

	let os = "web";
	if (base.includes("android")) {
		os = "android";
	} else if (base.includes("iphone") || base.includes("ipad") || base.includes("ios")) {
		os = "ios";
	} else if (base.includes("mac")) {
		os = "macos";
	} else if (base.includes("win")) {
		os = "windows";
	} else if (base.includes("linux")) {
		os = "linux";
	}

	const isTauriRuntime =
		typeof window !== "undefined" &&
		Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

	return `${os}-${isTauriRuntime ? "tauri" : "web"}`;
}

export function getIssueAppInfo(): {
	appVersion: string;
	platform: string;
	otaChannel: string;
} {
	return {
		appVersion: import.meta.env.VITE_APP_VERSION || "unknown",
		platform: detectClientPlatform(),
		otaChannel: getCurrentHotswapChannel(),
	};
}

export async function collectIssueLogs(): Promise<Record<string, unknown>> {
	const recentLogs = getRecentAppLogs(ISSUE_LOG_LIMIT);

	return {
		collectedAt: new Date().toISOString(),
		runtime: typeof window !== "undefined" && (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ? "tauri" : "web",
		platform: detectClientPlatform(),
		locale: navigator.language,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		userAgent: navigator.userAgent,
		logCount: recentLogs.length,
		logs: recentLogs,
	};
}