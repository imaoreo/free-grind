export type BrowseFilters = {
	onlineOnly: boolean;
	hasAlbum: boolean;
	photoOnly: boolean;
	faceOnly: boolean;
	notRecentlyChatted: boolean;
	fresh: boolean;
	rightNow: boolean;
	favorites: boolean;
	shuffle: boolean;
	hot: boolean;
	isVisiting: boolean;
};

export type BrowseSortOption =
	| "default"
	| "distance"
	| "age-asc"
	| "age-desc"
	| "popular"
	| "name";

export const defaultBrowseFilters: BrowseFilters = {
	onlineOnly: false,
	hasAlbum: false,
	photoOnly: false,
	faceOnly: false,
	notRecentlyChatted: false,
	fresh: false,
	rightNow: false,
	favorites: false,
	shuffle: false,
	hot: false,
	isVisiting: false,
};

export type BrowseFiltersDraft = {
	sortBy: BrowseSortOption;
	browseFilters: BrowseFilters;
	ageMin: string;
	ageMax: string;
	heightCmMin: string;
	heightCmMax: string;
	weightGramsMin: string;
	weightGramsMax: string;
	tribes: number[];
	lookingFor: number[];
	relationshipStatuses: number[];
	bodyTypes: number[];
	sexualPositions: number[];
	meetAt: number[];
	nsfwPics: number[];
	tags: string[];
	nicknameFilter: string;
};

type BrowseFiltersDraftInput = {
	sortBy?: BrowseSortOption;
	browseFilters?: Partial<BrowseFilters>;
	ageMin?: string;
	ageMax?: string;
	heightCmMin?: string;
	heightCmMax?: string;
	weightGramsMin?: string;
	weightGramsMax?: string;
	tribes?: number[];
	lookingFor?: number[];
	relationshipStatuses?: number[];
	bodyTypes?: number[];
	sexualPositions?: number[];
	meetAt?: number[];
	nsfwPics?: number[];
	tags?: string[];
	nicknameFilter?: string;
};

import { getSetting, setSetting } from "../../services/chatDb";

const STORAGE_KEY = "browseFilters";

function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function getDefaultBrowseFiltersDraft(): BrowseFiltersDraft {
	return {
		sortBy: "default",
		browseFilters: { ...defaultBrowseFilters },
		ageMin: "",
		ageMax: "",
		heightCmMin: "",
		heightCmMax: "",
		weightGramsMin: "",
		weightGramsMax: "",
		tribes: [],
		lookingFor: [],
		relationshipStatuses: [],
		bodyTypes: [],
		sexualPositions: [],
		meetAt: [],
		nsfwPics: [],
		tags: [],
		nicknameFilter: "",
	};
}

export function normalizeBrowseFiltersDraft(
	input: BrowseFiltersDraftInput | null | undefined,
): BrowseFiltersDraft {
	const defaults = getDefaultBrowseFiltersDraft();
	const draft = input ?? {};

	return {
		sortBy:
			draft.sortBy === "default" ||
			draft.sortBy === "distance" ||
			draft.sortBy === "age-asc" ||
			draft.sortBy === "age-desc" ||
			draft.sortBy === "popular" ||
			draft.sortBy === "name"
				? draft.sortBy
				: defaults.sortBy,
		browseFilters: {
			...defaultBrowseFilters,
			...(draft.browseFilters ?? {}),
		},
		ageMin: typeof draft.ageMin === "string" ? draft.ageMin : defaults.ageMin,
		ageMax: typeof draft.ageMax === "string" ? draft.ageMax : defaults.ageMax,
		heightCmMin:
			typeof draft.heightCmMin === "string"
				? draft.heightCmMin
				: defaults.heightCmMin,
		heightCmMax:
			typeof draft.heightCmMax === "string"
				? draft.heightCmMax
				: defaults.heightCmMax,
		weightGramsMin:
			typeof draft.weightGramsMin === "string"
				? draft.weightGramsMin
				: defaults.weightGramsMin,
		weightGramsMax:
			typeof draft.weightGramsMax === "string"
				? draft.weightGramsMax
				: defaults.weightGramsMax,
		tribes: isNumberArray(draft.tribes) ? draft.tribes : defaults.tribes,
		lookingFor: isNumberArray(draft.lookingFor)
			? draft.lookingFor
			: defaults.lookingFor,
		relationshipStatuses: isNumberArray(draft.relationshipStatuses)
			? draft.relationshipStatuses
			: defaults.relationshipStatuses,
		bodyTypes: isNumberArray(draft.bodyTypes) ? draft.bodyTypes : defaults.bodyTypes,
		sexualPositions: isNumberArray(draft.sexualPositions)
			? draft.sexualPositions
			: defaults.sexualPositions,
		meetAt: isNumberArray(draft.meetAt) ? draft.meetAt : defaults.meetAt,
		nsfwPics: isNumberArray(draft.nsfwPics) ? draft.nsfwPics : defaults.nsfwPics,
		tags: isStringArray(draft.tags) ? draft.tags : defaults.tags,
		nicknameFilter: typeof draft.nicknameFilter === "string" ? draft.nicknameFilter : defaults.nicknameFilter,
	};
}

// GridPage fully unmounts/remounts on every in-app navigation away from and
// back to "/", so its local filter state normally has to reset to defaults
// and wait on an async chatDb round trip to reload the real draft — visible
// to the user as filters flashing "gone" for a moment. This module-level
// cache survives that remount (but not a full page reload), so GridPage can
// seed its initial state from the last known-good draft instead of defaults.
let lastKnownBrowseFiltersDraft: BrowseFiltersDraft | null = null;

export function getCachedBrowseFiltersDraft(): BrowseFiltersDraft | null {
	return lastKnownBrowseFiltersDraft;
}

export async function loadBrowseFiltersDraft(): Promise<BrowseFiltersDraft> {
	try {
		const stored = await getSetting<BrowseFiltersDraftInput>(STORAGE_KEY);
		const normalized = normalizeBrowseFiltersDraft(stored);
		lastKnownBrowseFiltersDraft = normalized;
		return normalized;
	} catch {
		return getDefaultBrowseFiltersDraft();
	}
}

export async function saveBrowseFiltersDraft(draft: BrowseFiltersDraft): Promise<void> {
	lastKnownBrowseFiltersDraft = draft;
	try {
		await setSetting(STORAGE_KEY, draft);
	} catch {
		// Ignore storage failures to avoid blocking filter interactions.
	}
}
