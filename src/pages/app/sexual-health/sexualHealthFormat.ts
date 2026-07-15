// Matches the timestamp format used elsewhere in Settings (see
// formatEventTimestamp in SettingsBlockHistoryPage.tsx) — browser-default
// locale, not tied to the app's i18n language, for consistency app-wide.
export function formatDateTime(ms: number): string {
	return new Date(ms).toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function toDateTimeLocalValue(ms: number): string {
	const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
	return date.toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string): number {
	return new Date(value).getTime();
}

export function toDateInputValue(ms: number): string {
	const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
	return date.toISOString().slice(0, 10);
}
