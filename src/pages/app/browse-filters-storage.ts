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
};

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
};

export type BrowseFiltersDraft = {
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
};

type BrowseFiltersDraftInput = {
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
};

const STORAGE_KEY = "open-grind:browse-filters";

function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function getDefaultBrowseFiltersDraft(): BrowseFiltersDraft {
	return {
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
	};
}

export function normalizeBrowseFiltersDraft(
	input: BrowseFiltersDraftInput | null | undefined,
): BrowseFiltersDraft {
	const defaults = getDefaultBrowseFiltersDraft();
	const draft = input ?? {};

	return {
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
	};
}

export function loadBrowseFiltersDraft(): BrowseFiltersDraft {
	if (typeof window === "undefined") {
		return getDefaultBrowseFiltersDraft();
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return getDefaultBrowseFiltersDraft();
		}

		const parsed = JSON.parse(raw) as BrowseFiltersDraftInput;
		return normalizeBrowseFiltersDraft(parsed);
	} catch {
		return getDefaultBrowseFiltersDraft();
	}
}

export function saveBrowseFiltersDraft(draft: BrowseFiltersDraft): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
	} catch {
		// Ignore storage failures to avoid blocking filter interactions.
	}
}
