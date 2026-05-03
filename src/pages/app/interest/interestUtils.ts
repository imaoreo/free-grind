import type { TFunction } from "i18next";
import type { StoredInterestView } from "../../../services/interestViewsStore";
import { validateMediaHash } from "../../../utils/media";
import { formatRelativeTime } from "../../../utils/relativeTime";

export type InterestTab = "views" | "taps";

export type InterestItem = {
	profileId: string;
	displayName: string;
	imageHash: string | null;
	timestamp: number | null;
	tapType: number | null;
	viewCount: number | null;
	canOpenProfile: boolean;
};

export const PREVIEW_ID_PREFIX = "preview:";

export function fromStoredView(row: StoredInterestView): InterestItem {
	return {
		profileId: row.profileId,
		displayName: row.displayName,
		imageHash: row.imageHash,
		timestamp: row.timestamp ?? row.updatedAt,
		tapType: null,
		viewCount: row.viewCount,
		canOpenProfile: !row.profileId.startsWith(PREVIEW_ID_PREFIX),
	};
}

export function toStoredView(item: InterestItem): Omit<StoredInterestView, "updatedAt"> {
	return {
		profileId: item.profileId,
		displayName: item.displayName,
		imageHash: item.imageHash,
		timestamp: item.timestamp,
		viewCount: item.viewCount,
	};
}

function isPlaceholderName(name: string, profileId: string): boolean {
	return name === `Profile ${profileId}`;
}

function mergeViewItem(
	cached: InterestItem | null,
	incoming: InterestItem,
): InterestItem {
	if (!cached) {
		return incoming;
	}

	const incomingLooksPlaceholder = isPlaceholderName(
		incoming.displayName,
		incoming.profileId,
	);

	return {
		profileId: incoming.profileId,
		displayName:
			incomingLooksPlaceholder && !isPlaceholderName(cached.displayName, cached.profileId)
				? cached.displayName
				: incoming.displayName,
		imageHash: incoming.imageHash ?? cached.imageHash,
		timestamp: incoming.timestamp ?? cached.timestamp,
		tapType: null,
		viewCount: incoming.viewCount ?? cached.viewCount,
		canOpenProfile: incoming.canOpenProfile || cached.canOpenProfile,
	};
}

export function asObject(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toStringId(value: unknown): string | null {
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

export function toNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function getItemDisplayName(entry: Record<string, unknown>, profileId: string, t: TFunction): string {
	const value = entry.displayName;
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	return t("interest_page.profile_fallback", { id: profileId });
}

function getItemImageHash(entry: Record<string, unknown>): string | null {
	const candidates = [entry.profileImageMediaHash, entry.photoHash, entry.mediaHash];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && validateMediaHash(candidate)) {
			return candidate;
		}
	}
	return null;
}

function getItemTimestamp(entry: Record<string, unknown>): number | null {
	return (
		toNumber(entry.timestamp) ??
		toNumber(entry.sentOn) ??
		toNumber(entry.readOn) ??
		toNumber(entry.lastViewedAt) ??
		toNumber(entry.lastViewed) ??
		toNumber(entry.seen)
	);
}

function getViewEntryRecord(entry: unknown): Record<string, unknown> | null {
	const obj = asObject(entry);
	if (!obj) {
		return null;
	}

	const nestedCandidates = [obj.profile, obj.preview, obj.viewer, obj.user];
	for (const candidate of nestedCandidates) {
		const nested = asObject(candidate);
		if (nested) {
			return {
				...obj,
				...nested,
			};
		}
	}

	return obj;
}

function getViewProfileId(entry: Record<string, unknown>): string | null {
	return (
		toStringId(entry.profileId) ??
		toStringId(entry.viewerProfileId) ??
		toStringId(entry.id)
	);
}

function getPreviewSyntheticId(
	entry: Record<string, unknown>,
	index: number,
): string {
	const hash = typeof entry.profileImageMediaHash === "string" ? entry.profileImageMediaHash : "nohash";
	if (hash !== "nohash") {
		// Keep preview IDs stable across refreshes for the same hash.
		return `${PREVIEW_ID_PREFIX}${hash}`;
	}
	const seen = toNumber(entry.lastViewed) ?? toNumber(entry.seen) ?? toNumber(entry.timestamp) ?? 0;
	return `${PREVIEW_ID_PREFIX}${hash}:${seen}:${index}`;
}

export function normalizeViews(
	payload: unknown,
	previouslyCached: InterestItem[],
	t: TFunction
): InterestItem[] {
	const root = asObject(payload);
	if (!root) {
		return previouslyCached;
	}
	const dataRoot = asObject(root.data);

	const profilesRaw = Array.isArray(root.profiles)
		? root.profiles
		: Array.isArray(dataRoot?.profiles)
			? dataRoot.profiles
			: [];
	const previewsRaw = Array.isArray(root.previews)
		? root.previews
		: Array.isArray(dataRoot?.previews)
			? dataRoot.previews
			: [];

	const normalizedProfiles = profilesRaw
		.map<InterestItem | null>((entry) => {
			const obj = getViewEntryRecord(entry);
			if (!obj) {
				return null;
			}

			const profileId = getViewProfileId(obj);
			if (!profileId) {
				return null;
			}

			const viewedCount = asObject(obj.viewedCount);

			return {
				profileId,
				displayName: getItemDisplayName(obj, profileId, t),
				imageHash: getItemImageHash(obj),
				timestamp: getItemTimestamp(obj),
				tapType: null,
				viewCount: toNumber(viewedCount?.totalCount),
				canOpenProfile: true,
			};
		})
		.filter((entry): entry is InterestItem => entry !== null);

	const normalizedPreviews = previewsRaw
		.map<InterestItem | null>((entry, index) => {
			const obj = getViewEntryRecord(entry);
			if (!obj) {
				return null;
			}

			const profileId = getViewProfileId(obj) ?? getPreviewSyntheticId(obj, index);

			const viewedCount = asObject(obj.viewedCount);

			return {
				profileId,
				displayName:
					getViewProfileId(obj) !== null ? getItemDisplayName(obj, profileId, t) : t("interest_page.private_viewer"),
				imageHash: getItemImageHash(obj),
				timestamp: getItemTimestamp(obj),
				tapType: null,
				viewCount: toNumber(viewedCount?.totalCount),
				canOpenProfile: getViewProfileId(obj) !== null,
			};
		})
		.filter((entry): entry is InterestItem => entry !== null);

	const cachedMap = new Map(previouslyCached.map((item) => [item.profileId, item]));
	const profileMap = new Map(normalizedProfiles.map((item) => [item.profileId, item]));

	const merged: InterestItem[] = [];
	const seenIds = new Set<string>();
	const seenHashes = new Set<string>();

	for (const profileItem of normalizedProfiles) {
		const cachedItem = cachedMap.get(profileItem.profileId) ?? null;
		const nextItem = mergeViewItem(cachedItem, profileItem);
		if (seenIds.has(nextItem.profileId)) {
			continue;
		}
		if (nextItem.imageHash && seenHashes.has(nextItem.imageHash)) {
			continue;
		}
		merged.push(nextItem);
		seenIds.add(nextItem.profileId);
		if (nextItem.imageHash) {
			seenHashes.add(nextItem.imageHash);
		}
	}

	for (const cachedItem of previouslyCached) {
		if (seenIds.has(cachedItem.profileId)) {
			continue;
		}
		if (cachedItem.imageHash && seenHashes.has(cachedItem.imageHash)) {
			continue;
		}
		merged.push(cachedItem);
		seenIds.add(cachedItem.profileId);
		if (cachedItem.imageHash) {
			seenHashes.add(cachedItem.imageHash);
		}
	}

	for (const previewItem of normalizedPreviews) {
		if (seenIds.has(previewItem.profileId)) {
			continue;
		}
		if (previewItem.imageHash && seenHashes.has(previewItem.imageHash)) {
			continue;
		}
		if (cachedMap.has(previewItem.profileId) || profileMap.has(previewItem.profileId)) {
			continue;
		}
		merged.push(previewItem);
		seenIds.add(previewItem.profileId);
		if (previewItem.imageHash) {
			seenHashes.add(previewItem.imageHash);
		}
	}

	return merged;
}

export function normalizeTaps(payload: unknown, t: TFunction): InterestItem[] {
	const root = asObject(payload);
	if (!root || !Array.isArray(root.profiles)) {
		return [];
	}

	return root.profiles
		.map<InterestItem | null>((entry) => {
			const obj = asObject(entry);
			if (!obj) {
				return null;
			}

			const profileId = toStringId(obj.profileId) ?? toStringId(obj.senderId);
			if (!profileId) {
				return null;
			}

			return {
				profileId,
				displayName: getItemDisplayName(obj, profileId, t),
				imageHash: getItemImageHash(obj),
				timestamp: getItemTimestamp(obj),
				tapType: toNumber(obj.tapType),
				viewCount: null,
				canOpenProfile: true,
			};
		})
		.filter((entry): entry is InterestItem => entry !== null);
}

export function formatTimestamp(
	timestamp: number | null,
	t: TFunction,
	now: number = Date.now(),
): string {
	if (!timestamp) {
		return t("interest_page.unknown_time");
	}
	return formatRelativeTime(timestamp, now);
}

export function tapLabel(tapType: number | null, t: TFunction): string {
	switch (tapType) {
		case 0:
			return t("interest_page.tap_labels.friendly");
		case 1:
			return t("interest_page.tap_labels.hot");
		case 2:
			return t("interest_page.tap_labels.looking");
		default:
			return t("interest_page.tap_labels.default");
	}
}
