import z from "zod";

export const MAX_PROFILE_PHOTOS = 5;

export const profileSchema = z.object({
	profileId: z.string(),
	displayName: z.string().nullable().optional(),
	aboutMe: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	showAge: z.boolean().optional(),
	height: z.number().nullable().optional(),
	weight: z.number().nullable().optional(),
	ethnicity: z.number().nullable().optional(),
	bodyType: z.number().nullable().optional(),
	showPosition: z.boolean().optional(),
	sexualPosition: z.number().nullable().optional(),
	showTribes: z.boolean().optional(),
	grindrTribes: z.array(z.number()).optional().default([]),
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
		.array(z.object({ mediaHash: z.string().optional() }))
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

export interface ProfileDraft {
	displayName: string;
	aboutMe: string;
	profileTagsText: string;
	showAge: boolean;
	age: string;
	height: string;
	weight: string;
	ethnicity: string;
	bodyType: string;
	showPosition: boolean;
	sexualPosition: string;
	showTribes: boolean;
	grindrTribes: number[];
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
	age: "",
	height: "",
	weight: "",
	ethnicity: "",
	bodyType: "",
	showPosition: false,
	sexualPosition: "",
	showTribes: false,
	grindrTribes: [],
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

export function normalizeTagList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export async function buildSquareThumbCoords(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const x1 = (bitmap.width - side) / 2;
	const y1 = (bitmap.height - side) / 2;
	const x2 = x1 + side;
	const y2 = y1 + side;

	bitmap.close();

	// RectF query format is: y2,x1,x2,y1.
	return `${y2},${x1},${x2},${y1}`;
}

export function profileToDraft(
	profile: z.infer<typeof profileSchema> | null,
): ProfileDraft {
	if (!profile) {
		return emptyDraft;
	}

	return {
		displayName: profile.displayName ?? "",
		aboutMe: profile.aboutMe ?? "",
		profileTagsText: (profile.profileTags ?? []).join(", "),
		showAge: profile.showAge ?? true,
		age: profile.age?.toString() ?? "",
		height: profile.height?.toString() ?? "",
		weight: profile.weight?.toString() ?? "",
		ethnicity: profile.ethnicity?.toString() ?? "",
		bodyType: profile.bodyType?.toString() ?? "",
		showPosition: profile.showPosition ?? false,
		sexualPosition: profile.sexualPosition?.toString() ?? "",
		showTribes: profile.showTribes ?? false,
		grindrTribes: profile.grindrTribes ?? [],
		relationshipStatus: profile.relationshipStatus?.toString() ?? "",
		lookingFor: profile.lookingFor ?? [],
		meetAt: profile.meetAt ?? [],
		nsfw: profile.nsfw?.toString() ?? "",
		genders: profile.genders ?? [],
		pronouns: profile.pronouns ?? [],
		hivStatus: profile.hivStatus?.toString() ?? "",
		lastTestedDate: formatDateInput(profile.lastTestedDate),
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

export function parseNullableInteger(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : null;
}
