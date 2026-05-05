import i18n from "../../../i18n";
import type { BrowseCard, ManagedOption } from "../GridPage.types";

type AccountCreationAnchor = {
	time: number;
	id: number;
};

const ACCOUNT_CREATION_ANCHORS: readonly AccountCreationAnchor[] = [
	{ time: 1238563200, id: 0 },
	{ time: 1285027200, id: 1000000 },
	{ time: 1462924800, id: 35512000 },
	{ time: 1501804800, id: 132076000 },
	{ time: 1546547829, id: 201948000 },
	{ time: 1618531200, id: 351220000 },
	{ time: 1636150385, id: 390338000 },
	{ time: 1637963460, id: 394800000 },
	{ time: 1680393600, id: 505225000 },
	{ time: 1717200000, id: 630495000 },
	{ time: 1717372800, id: 634942000 },
	{ time: 1729950240, id: 699724000 },
	{ time: 1732986600, id: 710609000 },
	{ time: 1733349060, id: 711676000 },
	{ time: 1735229820, id: 718934000 },
	{ time: 1738065780, id: 730248000 },
	{ time: 1739059200, id: 733779000 },
	{ time: 1741564800, id: 744008000 },
];

function parseProfileId(profileId: string | number | null | undefined): number | null {
	if (typeof profileId === "number") {
		return Number.isFinite(profileId) ? profileId : null;
	}

	if (typeof profileId === "string") {
		const parsed = Number(profileId.trim());
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

export function estimateAccountCreationTimestamp(
	profileId: string | number | null | undefined,
): number | null {
	const id = parseProfileId(profileId);
	if (id == null || id < 0) {
		return null;
	}

	const first = ACCOUNT_CREATION_ANCHORS[0];
	const last = ACCOUNT_CREATION_ANCHORS[ACCOUNT_CREATION_ANCHORS.length - 1];

	let left = first;
	let right = ACCOUNT_CREATION_ANCHORS[1];

	if (id >= last.id) {
		left = ACCOUNT_CREATION_ANCHORS[ACCOUNT_CREATION_ANCHORS.length - 2];
		right = last;
	} else {
		for (let i = 0; i < ACCOUNT_CREATION_ANCHORS.length - 1; i += 1) {
			const current = ACCOUNT_CREATION_ANCHORS[i];
			const next = ACCOUNT_CREATION_ANCHORS[i + 1];

			if (id >= current.id && id <= next.id) {
				left = current;
				right = next;
				break;
			}
		}
	}

	const idRange = right.id - left.id;
	if (idRange <= 0) {
		return null;
	}

	const progress = (id - left.id) / idRange;
	const estimateSeconds = left.time + progress * (right.time - left.time);

	return Math.round(estimateSeconds * 1000);
}

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(lng: string, options: Intl.DateTimeFormatOptions) {
	const key = `${lng}-${JSON.stringify(options)}`;
	if (!dateTimeFormatterCache.has(key)) {
		dateTimeFormatterCache.set(key, new Intl.DateTimeFormat(lng, options));
	}
	return dateTimeFormatterCache.get(key)!;
}

export function formatEstimatedAccountCreation(
	profileId: string | number | null | undefined,
	t?: (key: string, options?: any) => string,
): string {
	const timestamp = estimateAccountCreationTimestamp(profileId);
	if (timestamp == null) {
		return t ? t("browse_page.unknown") : "Unknown";
	}

	const formatter = getDateTimeFormatter(i18n.language, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return formatter.format(new Date(timestamp));
}

export function formatDistance(
	distanceMeters: number | null | undefined,
	t?: (key: string, options?: any) => string,
): string {
	if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
		return t ? t("browse_page.distance_hidden") : "hidden";
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

export type OnlineStatusMeta = {
	isOnline: boolean;
	labelKey: string;
	count?: number;
	/** @deprecated Use labelKey and t() instead */
	label: string;
};

export function getOnlineStatusMeta(
	lastOnline: number | null | undefined,
	onlineUntil: number | null | undefined,
	nowTimestamp: number = Date.now(),
): OnlineStatusMeta {
	const hasLastOnline =
		typeof lastOnline === "number" && Number.isFinite(lastOnline);
	const hasOnlineUntil =
		typeof onlineUntil === "number" && Number.isFinite(onlineUntil);
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;
	const dayMs = 24 * hourMs;

	if (!hasLastOnline && !hasOnlineUntil) {
		return { isOnline: false, labelKey: "browse_page.status_offline", label: "Offline" };
	}

	if (hasOnlineUntil && (onlineUntil as number) > nowTimestamp) {
		const minsLeft = Math.max(
			1,
			Math.ceil(((onlineUntil as number) - nowTimestamp) / minuteMs),
		);
		return {
			isOnline: true,
			labelKey: "browse_page.status_online_left",
			count: minsLeft,
			label: `Online (${minsLeft}m left)`,
		};
	}

	const referenceTimestamp = hasLastOnline
		? (lastOnline as number)
		: (onlineUntil as number);
	const diffMs = Math.max(0, nowTimestamp - referenceTimestamp);

	if (diffMs < hourMs) {
		const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
		return {
			isOnline: false,
			labelKey: "browse_page.status_minutes_ago",
			count: minutes,
			label: `${minutes}m ago`,
		};
	}

	if (diffMs < dayMs) {
		const hours = Math.max(1, Math.floor(diffMs / hourMs));
		return {
			isOnline: false,
			labelKey: "browse_page.status_hours_ago",
			count: hours,
			label: `${hours}h ago`,
		};
	}

	const days = Math.max(1, Math.floor(diffMs / dayMs));
	return {
		isOnline: false,
		labelKey: "browse_page.status_days_ago",
		count: days,
		label: `${days}d ago`,
	};
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

export function formatTimeAgo(
	timestamp: number | null | undefined,
	t?: (key: string, options?: any) => string,
): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return t ? t("browse_page.unknown") : "Unknown";
	}

	const diffMs = Date.now() - timestamp;
	if (diffMs <= 0) {
		return t ? t("browse_page.status_just_now") : "Just now";
	}

	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;

	if (diffMs < hour) {
		const minutes = Math.max(1, Math.floor(diffMs / minute));
		return t ? t("browse_page.status_minutes_ago", { count: minutes }) : `${minutes}m ago`;
	}

	if (diffMs < day) {
		const hours = Math.max(1, Math.floor(diffMs / hour));
		return t ? t("browse_page.status_hours_ago", { count: hours }) : `${hours}h ago`;
	}

	const days = Math.max(1, Math.floor(diffMs / day));
	return t ? t("browse_page.status_days_ago", { count: days }) : `${days}d ago`;
}

export function formatOptionalNumber(
	value: number | null | undefined,
	t?: (key: string, options?: any) => string,
): string {
	if (value == null || !Number.isFinite(value)) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	return String(value);
}

export function formatEnumValue(
	value: number | null | undefined,
	labels: Record<number, string>,
	t?: (key: string, options?: any) => string,
): string {
	if (value == null || !Number.isFinite(value)) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	return labels[value] ?? String(value);
}

export function formatEnumArray(
	values: number[],
	labels: Record<number, string>,
	t?: (key: string, options?: any) => string,
): string {
	if (values.length === 0) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	return values.map((value) => labels[value] ?? String(value)).join(", ");
}

export function formatHeightCm(
	value: number | null | undefined,
	t?: (key: string, options?: any) => string,
): string {
	if (value == null || !Number.isFinite(value)) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	return `${value}cm`;
}

export function formatWeightKg(
	value: number | null | undefined,
	t?: (key: string, options?: any) => string,
): string {
	if (value == null || !Number.isFinite(value)) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	return `${(value / 1000).toFixed(0)}kg`;
}

export function shouldHideField(formattedValue: string | undefined): boolean {
	return !formattedValue || formattedValue === "Not set";
}

export function getEnumLabel(value: number, options: ManagedOption[]): string {
	return options.find((opt) => opt.value === value)?.label ?? String(value);
}
