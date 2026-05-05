/**
 * Format a timestamp as a short relative string ("Just now", "10 mins ago",
 * "Yesterday", "3 days ago") falling back to a locale date for older values.
 *
 * Strings are intentionally inline (English) to match the rest of this
 * codebase, which already hard-codes similar labels in ChatPage.
 */
export function formatRelativeTime(
	timestamp: number | null | undefined,
	now: number = Date.now(),
): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return "";
	}

	const diffMs = now - timestamp;
	if (diffMs < 0) {
		return "Just now";
	}

	const sec = Math.floor(diffMs / 1000);
	if (sec < 45) return "Just now";

	const min = Math.floor(sec / 60);
	if (min < 1) return "Just now";
	if (min === 1) return "1 min ago";
	if (min < 60) return `${min} mins ago`;

	const hour = Math.floor(min / 60);
	if (hour === 1) return "1 hour ago";
	if (hour < 24) return `${hour} hours ago`;

	const day = Math.floor(hour / 24);
	if (day === 1) return "Yesterday";
	if (day < 7) return `${day} days ago`;

	const week = Math.floor(day / 7);
	if (week === 1) return "1 week ago";
	if (week < 5) return `${week} weeks ago`;

	return new Date(timestamp).toLocaleDateString();
}
