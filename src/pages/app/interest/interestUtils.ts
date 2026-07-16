import type { TFunction } from "i18next";
import { formatRelativeTime } from "../../../utils/relativeTime";
import type { StoredInterestView } from "../../../services/interestViewsStore";
import { validateMediaHash } from "../../../utils/media";

export type InterestTab = "views" | "taps";

export type InterestItem = {
	profileId: string;
	displayName: string | null;
	imageHash: string | null;
	timestamp: number | null;
	tapType: number | null;
	viewCount: number | null;
	canOpenProfile: boolean;
	isFromCache?: boolean;
	isMutual?: boolean;
	onlineUntil?: number | null;
	rightNow?: string | null;
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
		isFromCache: true,
	};
}

export function toStoredView(item: InterestItem): Omit<StoredInterestView, "updatedAt"> {
	return {
		profileId: item.profileId,
		displayName: item.displayName ?? "",
		imageHash: item.imageHash,
		timestamp: item.timestamp,
		viewCount: item.viewCount,
	};
}

function isPlaceholderName(name: string | null, profileId: string): boolean {
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

	const isIncomingPreview = incoming.profileId.startsWith(PREVIEW_ID_PREFIX);
	const isCachedPreview = cached.profileId.startsWith(PREVIEW_ID_PREFIX);

	return {
		// Prefer real ID over preview ID
		profileId: isIncomingPreview && !isCachedPreview ? cached.profileId : incoming.profileId,
		displayName:
			incomingLooksPlaceholder && !isPlaceholderName(cached.displayName, cached.profileId)
				? cached.displayName
				: incoming.displayName,
		imageHash: incoming.imageHash ?? cached.imageHash,
		timestamp: incoming.timestamp ?? cached.timestamp,
		tapType: incoming.tapType ?? cached.tapType,
		viewCount: incoming.viewCount ?? cached.viewCount,
		canOpenProfile: incoming.canOpenProfile || cached.canOpenProfile,
		isFromCache: incoming.isFromCache ?? cached.isFromCache,
		isMutual: incoming.isMutual ?? cached.isMutual,
		onlineUntil: incoming.onlineUntil ?? cached.onlineUntil,
		rightNow: incoming.rightNow ?? cached.rightNow,
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

function getItemDisplayName(entry: Record<string, unknown>): string | null {
	const value = entry.displayName;
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	return null;
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

function getItemRightNow(entry: Record<string, unknown>): string | null {
	return typeof entry.rightNow === "string" ? entry.rightNow : null;
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

export type BrowseHashMatch = {
	profileId: string;
	displayName: string | null;
	onlineUntil: number | null;
	rightNow: string | null;
};

export function normalizeViews(
	payload: unknown,
	previouslyCached: InterestItem[],
	_t: TFunction,
	browseHashIndex?: Map<string, BrowseHashMatch>,
): InterestItem[] {
	const root = asObject(payload);
	if (!root) return previouslyCached;
	const dataRoot = asObject(root.data);

	const profilesRaw = Array.isArray(root.profiles) ? root.profiles : Array.isArray(dataRoot?.profiles) ? dataRoot.profiles : [];
	const previewsRaw = Array.isArray(root.previews) ? root.previews : Array.isArray(dataRoot?.previews) ? dataRoot.previews : [];

	// 1. Helper map for quick access to known profiles (by hash).
	// Seed from the browse grid first (weaker signal — just an identity guess),
	// then let previously-resolved interest entries override on hash collision
	// since those carry richer, interest-specific data.
	const hashToProfile = new Map<string, InterestItem>();
	if (browseHashIndex) {
		for (const [hash, match] of browseHashIndex) {
			hashToProfile.set(hash, {
				profileId: match.profileId,
				displayName: match.displayName,
				imageHash: hash,
				timestamp: null,
				tapType: null,
				viewCount: null,
				canOpenProfile: true,
				isFromCache: true,
				onlineUntil: match.onlineUntil,
				rightNow: match.rightNow,
			});
		}
	}
	for (const item of previouslyCached) {
		if (item.imageHash && !item.profileId.startsWith(PREVIEW_ID_PREFIX)) {
			hashToProfile.set(item.imageHash, item);
		}
	}

	// 2. Normalize raw data from server
	const incomingProfiles = profilesRaw.map((entry): InterestItem | null => {
		const obj = getViewEntryRecord(entry);
		if (!obj) return null;
		const profileId = getViewProfileId(obj);
		if (!profileId) return null;
		return {
			profileId,
			displayName: getItemDisplayName(obj),
			imageHash: getItemImageHash(obj),
			timestamp: getItemTimestamp(obj),
			tapType: null,
			viewCount: toNumber(asObject(obj.viewedCount)?.totalCount),
			canOpenProfile: true,
			isFromCache: false,
			onlineUntil: toNumber(obj.onlineUntil),
			rightNow: getItemRightNow(obj),
		};
	}).filter((it): it is InterestItem => it !== null);

	const incomingPreviews = previewsRaw.map((entry, index): InterestItem | null => {
		const obj = getViewEntryRecord(entry);
		if (!obj) return null;
		const imageHash = getItemImageHash(obj);

		// CHECK: Have we seen this hash before?
		const recoveredMatch = imageHash ? hashToProfile.get(imageHash) : null;

		const profileId = recoveredMatch ? recoveredMatch.profileId : (getViewProfileId(obj) ?? getPreviewSyntheticId(obj, index));

		return {
			profileId,
			displayName: recoveredMatch ? recoveredMatch.displayName : null,
			imageHash,
			timestamp: getItemTimestamp(obj),
			tapType: null,
			viewCount: toNumber(asObject(obj.viewedCount)?.totalCount),
			canOpenProfile: recoveredMatch ? true : (getViewProfileId(obj) !== null),
			isFromCache: !!recoveredMatch,
			onlineUntil: recoveredMatch ? recoveredMatch.onlineUntil : toNumber(obj.onlineUntil),
			rightNow: recoveredMatch ? recoveredMatch.rightNow : getItemRightNow(obj),
		};
	}).filter((it): it is InterestItem => it !== null);

	// 3. Merging
	const mergedMap = new Map<string, InterestItem>();

	// First, all items from cache (history)
	for (const item of previouslyCached) {
		mergedMap.set(item.profileId, item);
	}

	// Stale synthetic preview IDs (e.g. from before this hash was resolvable) keyed by
	// hash, so a newly-recovered real ID for the same hash can evict its old locked twin.
	const staleSyntheticIdByHash = new Map<string, string>();
	for (const item of previouslyCached) {
		if (item.profileId.startsWith(PREVIEW_ID_PREFIX) && item.imageHash) {
			staleSyntheticIdByHash.set(item.imageHash, item.profileId);
		}
	}

	// Then fresh profiles/previews from server (overwrite old items with new timestamps)
	for (const incoming of [...incomingProfiles, ...incomingPreviews]) {
		if (!incoming.profileId.startsWith(PREVIEW_ID_PREFIX) && incoming.imageHash) {
			const staleId = staleSyntheticIdByHash.get(incoming.imageHash);
			if (staleId && staleId !== incoming.profileId) {
				mergedMap.delete(staleId);
			}
		}
		const existing = mergedMap.get(incoming.profileId);
		mergedMap.set(incoming.profileId, mergeViewItem(existing ?? null, incoming));
	}

	return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export function normalizeTaps(payload: unknown, _t: TFunction): InterestItem[] {
	const root = asObject(payload);
	if (!root || !Array.isArray(root.profiles)) return [];

	const mergedMap = new Map<string, InterestItem>();

	for (const entry of root.profiles) {
		const obj = asObject(entry);
		if (!obj) continue;
		const profileId = toStringId(obj.profileId) ?? toStringId(obj.senderId);
		if (!profileId) continue;

		const incoming: InterestItem = {
			profileId,
			displayName: getItemDisplayName(obj),
			imageHash: getItemImageHash(obj),
			timestamp: getItemTimestamp(obj),
			tapType: toNumber(obj.tapType),
			viewCount: null,
			canOpenProfile: true,
			isMutual: obj.isMutual === true || obj.mutual === true,
			onlineUntil: toNumber(obj.onlineUntil),
			rightNow: getItemRightNow(obj),
		};

		const existing = mergedMap.get(profileId);
		// For taps, we prefer the one with the newer timestamp if duplicates exist
		if (!existing || (incoming.timestamp ?? 0) > (existing.timestamp ?? 0)) {
			mergedMap.set(profileId, incoming);
		}
	}

	return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export function formatTimestamp(
	timestamp: number | null,
	t: TFunction,
	now: number = Date.now(),
): string {
	const formatted = formatRelativeTime(timestamp, now);
	return formatted || t("interest_page.unknown_time");
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

export function getTapEmoji(tapType: number | null): string {
	switch (tapType) {
		case 0:
			return "👋";
		case 1:
			return "🔥";
		case 2:
			return "😈";
		default:
			return "🔥";
	}
}
