import z from "zod";
import {
	cmToInches,
	gramsToKg,
	gramsToPounds,
	inchesToCm,
	kgToGrams,
	poundsToGrams,
	type UnitsPreset,
} from "../../../utils/units";
import { calculateSquareCrop, validateMediaHash } from "../../../utils/media";

function isImperialHeight(unitsPreset: UnitsPreset): boolean {
	return unitsPreset === "uk" || unitsPreset === "american";
}

export const MAX_PROFILE_PHOTOS = 5;
export const MAX_PROFILE_TAGS = 10;
export const MAX_GENDERS = 3;
export const MAX_TRAVEL_PLANS = 3;

/** Media moderation review state, as returned per-item in a profile's `medias` array. */
export const MEDIA_MODERATION_STATE = {
	PENDING: 0,
	APPROVED: 1,
	REJECTED: 2,
} as const;

export const profileSchema = z.object({
	profileId: z.string(),
	displayName: z.string().nullable().optional(),
	aboutMe: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	showAge: z.boolean().optional(),
	showDistance: z.boolean().optional(),
	height: z.number().nullable().optional(),
	weight: z.number().nullable().optional(),
	ethnicity: z.number().nullable().optional(),
	bodyType: z.number().nullable().optional(),
	showPosition: z.boolean().optional(),
	sexualPosition: z.number().nullable().optional(),
	showTribes: z.boolean().optional(),
	grindrTribes: z.array(z.number()).optional().default([]),
	tribesImInto: z.array(z.number()).nullable().optional().default([]),
	relationshipStatus: z.number().nullable().optional(),
	lookingFor: z.array(z.number()).optional().default([]),
	meetAt: z.array(z.number()).optional().default([]),
	nsfw: z.number().nullable().optional(),
	genders: z.array(z.number()).optional().default([]),
	pronouns: z.array(z.number()).optional().default([]),
	hivStatus: z.number().nullable().optional(),
	lastTestedDate: z.number().nullable().optional(),
	sexualHealth: z.array(z.number()).optional().default([]),
	vaccines: z.array(z.number()).optional().default([]),
	profileTags: z.array(z.string()).optional().default([]),
	onlineUntil: z.number().nullable().optional(),
	rightNowText: z.string().nullable().optional(),
	profileImageMediaHash: z.string().nullable().optional(),
	isRoaming: z.boolean().optional(),
	isTeleporting: z.boolean().optional(),
	medias: z
		.array(
			z.object({
				mediaHash: z.string().optional(),
				state: z.number().nullable().optional(),
				reason: z.string().nullable().optional(),
			}),
		)
		.optional()
		.default([]),
	socialNetworks: z
		.object({
			instagram: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
			twitter: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
			facebook: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
		})
		.optional(),
});

export const profileResponseSchema = z.object({
	profiles: z.array(profileSchema).length(1),
});

/**
 * Picks the profile's primary photo hash the same way everywhere it's
 * needed (grid header avatar, chat header avatar, account switcher) — prefer
 * the first valid hash in `medias`, falling back to `profileImageMediaHash`
 * only when `medias` isn't empty (it can lag behind `medias` and still point
 * at a deleted photo once every photo has been removed).
 */
export function getProfilePhotoHash(
	profile: Pick<z.infer<typeof profileSchema>, "medias" | "profileImageMediaHash"> | null | undefined,
): string | null {
	if (!profile) {
		return null;
	}

	const medias = profile.medias ?? [];

	const fromMedias = medias
		.map((item) => item.mediaHash ?? "")
		.find((hash) => validateMediaHash(hash));
	if (fromMedias) {
		return fromMedias;
	}

	if (
		medias.length > 0 &&
		profile.profileImageMediaHash &&
		validateMediaHash(profile.profileImageMediaHash)
	) {
		return profile.profileImageMediaHash;
	}

	return null;
}

export interface ProfileDraft {
	displayName: string;
	aboutMe: string;
	profileTagsText: string;
	showAge: boolean;
	showDistance: boolean;
	age: string;
	height: string;
	weight: string;
	ethnicity: string;
	bodyType: string;
	showPosition: boolean;
	sexualPosition: string;
	showTribes: boolean;
	grindrTribes: number[];
	tribesImInto: number[];
	relationshipStatus: string;
	lookingFor: number[];
	meetAt: number[];
	nsfw: string;
	genders: number[];
	pronouns: number[];
	hivStatus: string;
	lastTestedDate: string;
	sexualHealth: number[];
	vaccines: number[];
	instagram: string;
	twitter: string;
	facebook: string;
}

export const emptyDraft: ProfileDraft = {
	displayName: "",
	aboutMe: "",
	profileTagsText: "",
	showAge: true,
	showDistance: true,
	age: "",
	height: "",
	weight: "",
	ethnicity: "",
	bodyType: "",
	showPosition: false,
	sexualPosition: "",
	showTribes: false,
	grindrTribes: [],
	tribesImInto: [],
	relationshipStatus: "",
	lookingFor: [],
	meetAt: [],
	nsfw: "",
	genders: [],
	pronouns: [],
	hivStatus: "",
	lastTestedDate: "",
	sexualHealth: [],
	vaccines: [],
	instagram: "",
	twitter: "",
	facebook: "",
};

export function formatDateInput(value: number | null | undefined): string {
	if (!value) {
		return "";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Date.parse(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Formats a timestamp as "yyyy-mm" for an <input type="month"> — used where only the month/year matters (e.g. last tested date), not the exact day. */
export function formatMonthInput(value: number | null | undefined): string {
	if (!value) {
		return "";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return date.toISOString().slice(0, 7);
}

/** Parses an <input type="month"> value ("yyyy-mm"), always resolving to the 1st of that month. */
export function parseMonthInput(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Date.parse(`${value}-01T00:00:00.000Z`);
	return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeTagList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

/** Adds/removes a tag key (case-insensitively) from the comma-separated draft field, for the tag picker dialog. */
export function toggleProfileTagText(currentText: string, tag: string): string {
	const list = normalizeTagList(currentText);
	const exists = list.some((item) => item.toLowerCase() === tag.toLowerCase());
	const next = exists
		? list.filter((item) => item.toLowerCase() !== tag.toLowerCase())
		: [...list, tag];
	return next.join(", ");
}

export async function buildSquareThumbCoords(file: File): Promise<string> {
	const { top, left, right, bottom } = await calculateSquareCrop(file);

	// RectF query format is: y2,x1,x2,y1.
	// which corresponds to: bottom, left, right, top
	return `${bottom},${left},${right},${top}`;
}

export function profileToDraft(
	profile: z.infer<typeof profileSchema> | null,
	unitsPreset: UnitsPreset = "world",
): ProfileDraft {
	if (!profile) {
		return emptyDraft;
	}

	return {
		displayName: profile.displayName ?? "",
		aboutMe: profile.aboutMe ?? "",
		profileTagsText: (profile.profileTags ?? []).join(", "),
		showAge: profile.showAge ?? true,
		showDistance: profile.showDistance ?? true,
		age: profile.age?.toString() ?? "",
		// profile.height is returned by the GET endpoint in cm; the editor input
		// is labeled (and saved) in cm, or total inches for uk/american presets.
		height: profile.height != null
			? String(Math.round(isImperialHeight(unitsPreset) ? cmToInches(profile.height) : profile.height))
			: "",
		// profile.weight is returned by the GET endpoint in grams; the editor
		// input is labeled (and saved) in kg, or lb for the american units preset.
		weight: profile.weight != null
			? String(Math.round(unitsPreset === "american" ? gramsToPounds(profile.weight) : gramsToKg(profile.weight)))
			: "",
		ethnicity: profile.ethnicity?.toString() ?? "",
		bodyType: profile.bodyType?.toString() ?? "",
		showPosition: profile.showPosition ?? false,
		sexualPosition: profile.sexualPosition?.toString() ?? "",
		showTribes: profile.showTribes ?? false,
		grindrTribes: profile.grindrTribes ?? [],
		tribesImInto: profile.tribesImInto ?? [],
		relationshipStatus: profile.relationshipStatus?.toString() ?? "",
		lookingFor: profile.lookingFor ?? [],
		meetAt: profile.meetAt ?? [],
		nsfw: profile.nsfw?.toString() ?? "",
		genders: profile.genders ?? [],
		pronouns: profile.pronouns ?? [],
		hivStatus: profile.hivStatus?.toString() ?? "",
		lastTestedDate: formatMonthInput(profile.lastTestedDate),
		sexualHealth: profile.sexualHealth ?? [],
		vaccines: profile.vaccines ?? [],
		instagram: profile.socialNetworks?.instagram?.userId ?? "",
		twitter: profile.socialNetworks?.twitter?.userId ?? "",
		facebook: profile.socialNetworks?.facebook?.userId ?? "",
	};
}

export function parseNullableNumber(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

// The weight input is shown/typed in kg (or lb for the american units preset),
// but the API reads and writes weight in grams.
export function parseNullableWeightToGrams(value: string, unitsPreset: UnitsPreset): number | null {
	const amount = parseNullableNumber(value);
	if (amount == null) {
		return null;
	}
	return Math.round(unitsPreset === "american" ? poundsToGrams(amount) : kgToGrams(amount));
}

// The height input is shown/typed in cm (or total inches for the uk/american
// units presets), but the API reads and writes height in cm.
export function parseNullableHeightToCm(value: string, unitsPreset: UnitsPreset): number | null {
	const amount = parseNullableNumber(value);
	if (amount == null) {
		return null;
	}
	return Math.round(isImperialHeight(unitsPreset) ? inchesToCm(amount) : amount);
}

export function parseNullableInteger(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : null;
}
