import i18n from "../i18n";

// Optimization: Cache the formatter to avoid expensive re-instantiation in long lists
const formatterCache = new Map<string, Intl.RelativeTimeFormat>();

function getRelativeFormatter(lang: string) {
	if (!formatterCache.has(lang)) {
		formatterCache.set(
			lang,
			new Intl.RelativeTimeFormat(lang, {
				numeric: "auto",
				style: "long",
			}),
		);
	}
	return formatterCache.get(lang)!;
}

/**
 * Format a timestamp as a short relative string falling back to a locale date for older values.
 * Uses Intl.RelativeTimeFormat and synchronizes with the app's current i18n language.
 */
export function formatRelativeTime(
	timestamp: number | null | undefined,
	now: number = Date.now(),
): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return "";
	}

	const diffMs = now - timestamp;
	const lang = i18n.language;

	// For very recent items, show a localized "Just now" or similar.
	// We use Math.abs just in case of minor clock drift.
	if (Math.abs(diffMs) < 60000) {
		return i18n.t("browse_page.status_just_now");
	}

	const formatter = getRelativeFormatter(lang);

	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 60) {
		return formatter.format(-minutes, "minute");
	}
	if (hours < 24) {
		return formatter.format(-hours, "hour");
	}
	if (days < 7) {
		return formatter.format(-days, "day");
	}

	// For older dates, use the browser's default locale date format
	return new Date(timestamp).toLocaleDateString(lang);
}
