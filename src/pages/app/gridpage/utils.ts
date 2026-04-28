import type { BrowseCard, ManagedOption } from "../GridPage.types";

export function formatDistance(
	distanceMeters: number | null | undefined,
): string {
	if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
		return "hidden";
	}

	if (distanceMeters < 1000) {
		return `${Math.max(0, Math.round(distanceMeters))} m`;
	}

	return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function isCurrentlyOnline(
	onlineUntil: number | null | undefined,
): boolean {
	if (!onlineUntil || !Number.isFinite(onlineUntil)) {
		return false;
	}

	return onlineUntil > Date.now();
}

export function getDisplayName(card: BrowseCard): string {
	const value = card.displayName?.trim();
	if (value) {
		return value;
	}

	return ``;
}

export function getCardInitials(name: string): string {
	const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);

	if (parts.length === 0) {
		return "?";
	}

	return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function formatTimeAgo(timestamp: number | null | undefined): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return "Unknown";
	}

	const diffMs = Date.now() - timestamp;
	if (diffMs <= 0) {
		return "Just now";
	}

	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;

	if (diffMs < hour) {
		const minutes = Math.max(1, Math.floor(diffMs / minute));
		return `${minutes}m ago`;
	}

	if (diffMs < day) {
		const hours = Math.max(1, Math.floor(diffMs / hour));
		return `${hours}h ago`;
	}

	const days = Math.max(1, Math.floor(diffMs / day));
	return `${days}d ago`;
}

export function formatOptionalNumber(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return String(value);
}

export function formatEnumValue(
	value: number | null | undefined,
	labels: Record<number, string>,
): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return labels[value] ?? String(value);
}

export function formatEnumArray(
	values: number[],
	labels: Record<number, string>,
): string {
	if (values.length === 0) {
		return "Not set";
	}

	return values.map((value) => labels[value] ?? String(value)).join(", ");
}

export function formatHeightCm(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return `${value}cm`;
}

export function formatWeightKg(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return `${(value / 1000).toFixed(0)}kg`;
}

export function shouldHideField(formattedValue: string | undefined): boolean {
	return !formattedValue || formattedValue === "Not set";
}

export function getEnumLabel(value: number, options: ManagedOption[]): string {
	return options.find((opt) => opt.value === value)?.label ?? String(value);
}
