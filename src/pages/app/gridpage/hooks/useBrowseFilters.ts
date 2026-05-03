import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
	type BrowseFilters,
	type BrowseFiltersDraft,
	type BrowseSortOption,
	defaultBrowseFilters,
	normalizeBrowseFiltersDraft,
	saveBrowseFiltersDraft,
} from "../../browse-filters-storage";

export function useBrowseFilters(persistedBrowseFilters: BrowseFiltersDraft) {
	const location = useLocation();

	const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(
		persistedBrowseFilters.browseFilters,
	);
	const [ageMin, setAgeMin] = useState(persistedBrowseFilters.ageMin);
	const [ageMax, setAgeMax] = useState(persistedBrowseFilters.ageMax);
	const [heightCmMin, setHeightCmMin] = useState(persistedBrowseFilters.heightCmMin);
	const [heightCmMax, setHeightCmMax] = useState(persistedBrowseFilters.heightCmMax);
	const [weightGramsMin, setWeightGramsMin] = useState(persistedBrowseFilters.weightGramsMin);
	const [weightGramsMax, setWeightGramsMax] = useState(persistedBrowseFilters.weightGramsMax);
	const [tribes, setTribes] = useState<number[]>(persistedBrowseFilters.tribes);
	const [lookingFor, setLookingFor] = useState<number[]>(persistedBrowseFilters.lookingFor);
	const [relationshipStatuses, setRelationshipStatuses] = useState<number[]>(
		persistedBrowseFilters.relationshipStatuses,
	);
	const [bodyTypes, setBodyTypes] = useState<number[]>(persistedBrowseFilters.bodyTypes);
	const [sexualPositions, setSexualPositions] = useState<number[]>(
		persistedBrowseFilters.sexualPositions,
	);
	const [meetAt, setMeetAt] = useState<number[]>(persistedBrowseFilters.meetAt);
	const [nsfwPics, setNsfwPics] = useState<number[]>(persistedBrowseFilters.nsfwPics);
	const [tags, setTags] = useState<string[]>(persistedBrowseFilters.tags);
	const [sortBy, setSortBy] = useState<BrowseSortOption>(persistedBrowseFilters.sortBy);

	// Apply incoming filter state from navigation
	useEffect(() => {
		const safeState =
			typeof location.state === "object" && location.state !== null
				? (location.state as { browseFiltersDraft?: Partial<BrowseFiltersDraft> })
				: {};
		const draft = safeState.browseFiltersDraft;
		if (!draft) {
			return;
		}

		const normalized = normalizeBrowseFiltersDraft(draft);
		setSortBy(normalized.sortBy);
		setBrowseFilters(normalized.browseFilters);
		setAgeMin(normalized.ageMin);
		setAgeMax(normalized.ageMax);
		setHeightCmMin(normalized.heightCmMin);
		setHeightCmMax(normalized.heightCmMax);
		setWeightGramsMin(normalized.weightGramsMin);
		setWeightGramsMax(normalized.weightGramsMax);
		setTribes(normalized.tribes);
		setLookingFor(normalized.lookingFor);
		setRelationshipStatuses(normalized.relationshipStatuses);
		setBodyTypes(normalized.bodyTypes);
		setSexualPositions(normalized.sexualPositions);
		setMeetAt(normalized.meetAt);
		setNsfwPics(normalized.nsfwPics);
		setTags(normalized.tags);
	}, [location.key, location.state]);

	// Persist filter state on every change
	useEffect(() => {
		saveBrowseFiltersDraft({
			sortBy,
			browseFilters,
			ageMin,
			ageMax,
			heightCmMin,
			heightCmMax,
			weightGramsMin,
			weightGramsMax,
			tribes,
			lookingFor,
			relationshipStatuses,
			bodyTypes,
			sexualPositions,
			meetAt,
			nsfwPics,
			tags,
		});
	}, [
		browseFilters,
		ageMin,
		ageMax,
		heightCmMin,
		heightCmMax,
		weightGramsMin,
		weightGramsMax,
		tribes,
		lookingFor,
		relationshipStatuses,
		bodyTypes,
		sexualPositions,
		meetAt,
		nsfwPics,
		tags,
		sortBy,
	]);

	const activeBrowseFilters = useMemo(() => {
		const next: Partial<BrowseFilters> = {};
		for (const [key, value] of Object.entries(browseFilters)) {
			if (value) {
				next[key as keyof BrowseFilters] = true;
			}
		}
		return next;
	}, [browseFilters]);

	const browseRequestFilters = useMemo(() => {
		const next: {
			onlineOnly?: boolean;
			photoOnly?: boolean;
			faceOnly?: boolean;
			hasAlbum?: boolean;
			notRecentlyChatted?: boolean;
			fresh?: boolean;
			rightNow?: boolean;
			favorites?: boolean;
			shuffle?: boolean;
			hot?: boolean;
			ageMin?: number;
			ageMax?: number;
			heightCmMin?: number;
			heightCmMax?: number;
			weightGramsMin?: number;
			weightGramsMax?: number;
			tribes?: string;
			lookingFor?: string;
			relationshipStatuses?: string;
			bodyTypes?: string;
			sexualPositions?: string;
			meetAt?: string;
			nsfwPics?: string;
			tags?: string;
		} = { ...activeBrowseFilters };

		const toOptionalNumber = (value: string): number | undefined => {
			const normalized = value.trim();
			if (!normalized) return undefined;
			const parsed = Number(normalized);
			return Number.isFinite(parsed) ? parsed : undefined;
		};

		const toOptionalNumberCsv = (value: number[]): string | undefined => {
			if (value.length === 0) return undefined;
			const normalized = [...new Set(value)]
				.filter((item) => Number.isFinite(item))
				.join(",");
			return normalized.length > 0 ? normalized : undefined;
		};

		const toOptionalTagCsv = (value: string[]): string | undefined => {
			if (value.length === 0) return undefined;
			const normalized = [...new Set(value.map((item) => item.trim()))]
				.filter((item) => item.length > 0)
				.join(",");
			return normalized.length > 0 ? normalized : undefined;
		};

		const parsedAgeMin = toOptionalNumber(ageMin);
		const parsedAgeMax = toOptionalNumber(ageMax);
		const parsedHeightCmMin = toOptionalNumber(heightCmMin);
		const parsedHeightCmMax = toOptionalNumber(heightCmMax);
		const parsedWeightGramsMin = toOptionalNumber(weightGramsMin);
		const parsedWeightGramsMax = toOptionalNumber(weightGramsMax);

		if (typeof parsedAgeMin === "number" && parsedAgeMin >= 18) next.ageMin = parsedAgeMin;
		if (typeof parsedAgeMax === "number" && parsedAgeMax >= 18) next.ageMax = parsedAgeMax;
		if (typeof parsedHeightCmMin === "number") next.heightCmMin = parsedHeightCmMin;
		if (typeof parsedHeightCmMax === "number") next.heightCmMax = parsedHeightCmMax;
		if (typeof parsedWeightGramsMin === "number") next.weightGramsMin = parsedWeightGramsMin;
		if (typeof parsedWeightGramsMax === "number") next.weightGramsMax = parsedWeightGramsMax;

		const parsedTribes = toOptionalNumberCsv(tribes);
		const parsedLookingFor = toOptionalNumberCsv(lookingFor);
		const parsedRelationshipStatuses = toOptionalNumberCsv(relationshipStatuses);
		const parsedBodyTypes = toOptionalNumberCsv(bodyTypes);
		const parsedSexualPositions = toOptionalNumberCsv(sexualPositions);
		const parsedMeetAt = toOptionalNumberCsv(meetAt);
		const parsedNsfwPics = toOptionalNumberCsv(nsfwPics);
		const parsedTags = toOptionalTagCsv(tags);

		if (parsedTribes) next.tribes = parsedTribes;
		if (parsedLookingFor) next.lookingFor = parsedLookingFor;
		if (parsedRelationshipStatuses) next.relationshipStatuses = parsedRelationshipStatuses;
		if (parsedBodyTypes) next.bodyTypes = parsedBodyTypes;
		if (parsedSexualPositions) next.sexualPositions = parsedSexualPositions;
		if (parsedMeetAt) next.meetAt = parsedMeetAt;
		if (parsedNsfwPics) next.nsfwPics = parsedNsfwPics;
		if (parsedTags) next.tags = parsedTags;

		return next;
	}, [
		activeBrowseFilters,
		ageMax,
		ageMin,
		heightCmMax,
		heightCmMin,
		weightGramsMax,
		weightGramsMin,
		tribes,
		lookingFor,
		relationshipStatuses,
		bodyTypes,
		sexualPositions,
		meetAt,
		nsfwPics,
		tags,
	]);

	const hasActiveBrowseFilters = Object.keys(browseRequestFilters).length > 0;

	const clearBrowseFilters = () => {
		setBrowseFilters(defaultBrowseFilters);
		setAgeMin("");
		setAgeMax("");
		setHeightCmMin("");
		setHeightCmMax("");
		setWeightGramsMin("");
		setWeightGramsMax("");
		setTribes([]);
		setLookingFor([]);
		setRelationshipStatuses([]);
		setBodyTypes([]);
		setSexualPositions([]);
		setMeetAt([]);
		setNsfwPics([]);
		setTags([]);
	};

	return {
		browseFilters,
		setBrowseFilters,
		ageMin,
		setAgeMin,
		ageMax,
		setAgeMax,
		heightCmMin,
		setHeightCmMin,
		heightCmMax,
		setHeightCmMax,
		weightGramsMin,
		setWeightGramsMin,
		weightGramsMax,
		setWeightGramsMax,
		tribes,
		setTribes,
		lookingFor,
		setLookingFor,
		relationshipStatuses,
		setRelationshipStatuses,
		bodyTypes,
		setBodyTypes,
		sexualPositions,
		setSexualPositions,
		meetAt,
		setMeetAt,
		nsfwPics,
		setNsfwPics,
		tags,
		setTags,
		sortBy,
		setSortBy,
		browseRequestFilters,
		hasActiveBrowseFilters,
		clearBrowseFilters,
	};
}
