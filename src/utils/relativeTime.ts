import i18n from "../i18n";

const formatterCache = new Map<string, Intl.RelativeTimeFormat>();

function getLongRelativeFormatter(lang: string) {
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

// Formats as short relative units (e.g. 20m ago, 2h ago)
export function formatRelativeTime(
	timestamp: number | null | undefined,
	now: number = Date.now(),
): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return "";
	}

	const diffMs = now - timestamp;
	const lang = i18n.language;

	if (Math.abs(diffMs) < 60000) {
		return i18n.t("browse_page.status_just_now");
	}

	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 60) {
		return i18n.t("browse_page.status_minutes_ago", { count: minutes });
	}
	if (hours < 24) {
		return i18n.t("browse_page.status_hours_ago", { count: hours });
	}
	if (days < 7) {
		return i18n.t("browse_page.status_days_ago", { count: days });
	}

	return new Date(timestamp).toLocaleDateString(lang);
}

// Formats as long relative units (e.g. 20 minutes ago, 2 hours ago)
export function formatLongRelativeTime(
	timestamp: number | null | undefined,
	now: number = Date.now(),
): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return "";
	}

	const diffMs = now - timestamp;
	const lang = i18n.language;

	if (Math.abs(diffMs) < 60000) {
		return i18n.t("browse_page.status_just_now");
	}

	const formatter = getLongRelativeFormatter(lang);

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

	return new Date(timestamp).toLocaleDateString(lang);
}
