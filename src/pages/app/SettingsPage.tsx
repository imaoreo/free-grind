import { useCallback, useEffect, useMemo, useState } from "react";
import {
	AtSign,
	BadgeInfo,
	ImageOff,
	Ruler,
	ShieldPlus,
	Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import z from "zod";
import { useAuth } from "../../contexts/AuthContext";
import { useApi } from "../../hooks/useApi";

const lookingForLabels: Record<number, string> = {
	2: "Chat",
	3: "Dates",
	4: "Friends",
	5: "Networking",
	6: "Relationship",
	7: "Hookups",
};

const relationshipStatusLabels: Record<number, string> = {
	1: "Single",
	2: "Dating",
	3: "Exclusive",
	4: "Committed",
	5: "Partnered",
	6: "Engaged",
	7: "Married",
	8: "Open Relationship",
};

const bodyTypeLabels: Record<number, string> = {
	1: "Toned",
	2: "Average",
	3: "Large",
	4: "Muscular",
	5: "Slim",
	6: "Stocky",
};

const ethnicityLabels: Record<number, string> = {
	1: "Asian",
	2: "Black",
	3: "Latino",
	4: "Middle Eastern",
	5: "Mixed",
	6: "Native American",
	7: "White",
	8: "Other",
	9: "South Asian",
};

const sexualPositionLabels: Record<number, string> = {
	1: "Top",
	2: "Bottom",
	3: "Versatile",
	4: "Vers Bottom",
	5: "Vers Top",
	6: "Side",
};

const meetAtLabels: Record<number, string> = {
	1: "My Place",
	2: "Your Place",
	3: "Bar",
	4: "Coffee Shop",
	5: "Restaurant",
};

const hivStatusLabels: Record<number, string> = {
	1: "Negative",
	2: "Negative, on PrEP",
	3: "Positive",
	4: "Positive, undetectable",
};

const nsfwLabels: Record<number, string> = {
	1: "Never",
	2: "Not At First",
	3: "Yes Please",
};

const sexualHealthLabels: Record<number, string> = {
	1: "Condoms",
	2: "I'm on doxyPEP",
	3: "I'm on PrEP",
	4: "I'm HIV undetectable",
	5: "Prefer to discuss",
};

const vaccineLabels: Record<number, string> = {
	1: "COVID-19",
	2: "Monkeypox",
	3: "Meningitis",
};

const tribeLabels: Record<number, string> = {
	1: "Bear",
	2: "Clean-Cut",
	3: "Daddy",
	4: "Discreet",
	5: "Geek",
	6: "Jock",
	7: "Leather",
	8: "Otter",
	9: "Poz",
	10: "Rugged",
	11: "Sober",
	12: "Trans",
	13: "Twink",
};

const relationshipStatusOptions = Object.entries(relationshipStatusLabels).map(
	([value, label]) => ({ value, label }),
);

const bodyTypeOptions = Object.entries(bodyTypeLabels).map(
	([value, label]) => ({
		value,
		label,
	}),
);

const ethnicityOptions = Object.entries(ethnicityLabels).map(
	([value, label]) => ({
		value,
		label,
	}),
);

const positionOptions = Object.entries(sexualPositionLabels).map(
	([value, label]) => ({ value, label }),
);

const lookingForOptions = Object.entries(lookingForLabels).map(
	([value, label]) => ({ value: Number(value), label }),
);

const meetAtOptions = Object.entries(meetAtLabels).map(([value, label]) => ({
	value: Number(value),
	label,
}));

const hivStatusOptions = Object.entries(hivStatusLabels).map(
	([value, label]) => ({
		value,
		label,
	}),
);

const nsfwOptions = Object.entries(nsfwLabels).map(([value, label]) => ({
	value,
	label,
}));

const sexualHealthOptions = Object.entries(sexualHealthLabels).map(
	([value, label]) => ({ value: Number(value), label }),
);

const vaccineOptions = Object.entries(vaccineLabels).map(([value, label]) => ({
	value: Number(value),
	label,
}));

const tribeOptions = Object.entries(tribeLabels).map(([value, label]) => ({
	value: Number(value),
	label,
}));

const profileSchema = z.object({
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

const profileResponseSchema = z.object({
	profiles: z.array(profileSchema).length(1),
});

const pronounOptionSchema = z.object({
	pronounId: z.number(),
	pronoun: z.string(),
});

const genderOptionSchema = z.object({
	genderId: z.number(),
	gender: z.string(),
});

interface ProfileDraft {
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

const emptyDraft: ProfileDraft = {
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

function formatDateInput(value: number | null | undefined): string {
	if (!value) {
		return "";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Date.parse(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTagList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function profileToDraft(
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

function parseNullableNumber(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableInteger(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : null;
}

function CategoryHeader({
	title,
	description,
	icon: Icon,
}: {
	title: string;
	description: string;
	icon: typeof Ruler;
}) {
	return (
		<div className="mb-4 flex items-start gap-3">
			<div className="mt-0.5 rounded-xl bg-[var(--surface-2)] p-2 text-[var(--text-muted)]">
				<Icon className="h-4 w-4" />
			</div>
			<div>
				<p className="text-sm font-medium text-[var(--text-muted)]">{title}</p>
				<h3 className="mt-1 text-lg font-semibold">{description}</h3>
			</div>
		</div>
	);
}

function ToggleRow({
	checked,
	onChange,
	label,
	description,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description: string;
}) {
	return (
		<label className="flex items-start justify-between gap-4 rounded-2xl bg-[var(--surface-2)] px-4 py-3">
			<span>
				<span className="block text-sm font-medium">{label}</span>
				<span className="mt-1 block text-sm text-[var(--text-muted)]">
					{description}
				</span>
			</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="mt-1 h-4 w-4 accent-[var(--accent)]"
			/>
		</label>
	);
}

function ChipGroup({
	options,
	selected,
	onToggle,
}: {
	options: Array<{ value: number; label: string }>;
	selected: number[];
	onToggle: (value: number) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{options.map((option) => {
				const active = selected.includes(option.value);

				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onToggle(option.value)}
						className={
							active
								? "rounded-full bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-contrast)]"
								: "rounded-full border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)]"
						}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

export function SettingsPage() {
	const { userId, logout } = useAuth();
	const { fetchRest } = useApi();
	const navigate = useNavigate();
	const [profile, setProfile] = useState<z.infer<typeof profileSchema> | null>(
		null,
	);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
	const [isSaving, setIsSaving] = useState(false);
	const [genderOptions, setGenderOptions] = useState<
		Array<{ value: number; label: string }>
	>([]);
	const [pronounOptions, setPronounOptions] = useState<
		Array<{ value: number; label: string }>
	>([]);

	const loadProfile = useCallback(async () => {
		if (!userId) {
			setProfile(null);
			setIsLoadingProfile(false);
			return;
		}

		try {
			setIsLoadingProfile(true);
			setProfileError(null);
			const response = await fetchRest(`/v7/profiles/${userId}`);

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to load profile (${response.status})`);
			}

			const parsed = profileResponseSchema.parse(response.json());
			setProfile(parsed.profiles[0]);
		} catch (error) {
			setProfile(null);
			setProfileError(
				error instanceof Error ? error.message : "Failed to load profile",
			);
		} finally {
			setIsLoadingProfile(false);
		}
	}, [fetchRest, userId]);

	const loadManagedOptions = useCallback(async () => {
		try {
			const gendersResponse = await fetchRest("/public/v2/genders");
			const pronounsResponse = userId
				? await fetchRest("/v1/pronouns")
				: null;

			if (gendersResponse.status >= 200 && gendersResponse.status < 300) {
				const parsed = z
					.array(genderOptionSchema)
					.parse(gendersResponse.json());
				setGenderOptions(
					parsed.map((item) => ({ value: item.genderId, label: item.gender })),
				);
			}

			if (
				pronounsResponse &&
				pronounsResponse.status >= 200 &&
				pronounsResponse.status < 300
			) {
				const parsed = z
					.array(pronounOptionSchema)
					.parse(pronounsResponse.json());
				setPronounOptions(
					parsed.map((item) => ({
						value: item.pronounId,
						label: item.pronoun,
					})),
				);
			} else if (!userId) {
				setPronounOptions([]);
			}
		} catch {
			setGenderOptions([]);
			setPronounOptions([]);
		}
	}, [fetchRest, userId]);

	useEffect(() => {
		void loadProfile();
		void loadManagedOptions();
	}, [loadManagedOptions, loadProfile]);

	useEffect(() => {
		setDraft(profileToDraft(profile));
	}, [profile]);

	const displayName = useMemo(() => {
		if (profile?.displayName?.trim()) {
			return profile.displayName.trim();
		}

		return userId ? `Profile ${userId}` : "Your profile";
	}, [profile?.displayName, userId]);

	const draftDisplayName = useMemo(() => {
		return draft.displayName.trim() || displayName;
	}, [displayName, draft.displayName]);

	const draftInitials = useMemo(() => {
		const parts = draftDisplayName.split(/\s+/).filter(Boolean).slice(0, 2);
		return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
	}, [draftDisplayName]);

	const savedDraft = useMemo(() => profileToDraft(profile), [profile]);

	const hasChanges = useMemo(
		() => JSON.stringify(draft) !== JSON.stringify(savedDraft),
		[draft, savedDraft],
	);

	const tagList = useMemo(
		() => normalizeTagList(draft.profileTagsText),
		[draft.profileTagsText],
	);

	const selectedRelationshipLabel = useMemo(() => {
		if (!draft.relationshipStatus) {
			return "Relationship not set";
		}

		return (
			relationshipStatusLabels[Number(draft.relationshipStatus)] ??
			`Status ${draft.relationshipStatus}`
		);
	}, [draft.relationshipStatus]);

	const selectedBodyTypeLabel = useMemo(() => {
		if (!draft.bodyType) {
			return "Body type not set";
		}

		return bodyTypeLabels[Number(draft.bodyType)] ?? `Type ${draft.bodyType}`;
	}, [draft.bodyType]);

	const displayNameError = useMemo(() => {
		const value = draft.displayName.trim();
		if (!value) {
			return null;
		}

		if (value.length < 3 || value.length > 15) {
			return "Display name must be between 3 and 15 characters.";
		}

		return null;
	}, [draft.displayName]);

	const aboutMeError = useMemo(() => {
		if (draft.aboutMe.length > 255) {
			return "About Me must stay under 255 characters.";
		}

		return null;
	}, [draft.aboutMe]);

	const canSave = hasChanges && !isSaving && !displayNameError && !aboutMeError;

	const handleDraftChange = <K extends keyof ProfileDraft>(
		key: K,
		value: ProfileDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
	};

	const toggleMultiValue = (
		key:
			| "lookingFor"
			| "meetAt"
			| "grindrTribes"
			| "genders"
			| "pronouns"
			| "sexualHealth"
			| "vaccines",
		value: number,
	) => {
		setDraft((current) => ({
			...current,
			[key]: current[key].includes(value)
				? current[key].filter((item) => item !== value)
				: [...current[key], value].sort((left, right) => left - right),
		}));
	};

	const handleSaveProfile = async () => {
		if (!userId || !canSave) {
			return;
		}

		setIsSaving(true);

		try {
			const response = await fetchRest("/v4/me/profile", {
				method: "PATCH",
				body: {
					displayName: draft.displayName.trim() || null,
					aboutMe: draft.aboutMe.trim() || null,
					profileTags: tagList,
					showAge: draft.showAge,
					age: parseNullableInteger(draft.age),
					height: parseNullableNumber(draft.height),
					weight: parseNullableNumber(draft.weight),
					ethnicity: parseNullableInteger(draft.ethnicity),
					bodyType: parseNullableInteger(draft.bodyType),
					showPosition: draft.showPosition,
					sexualPosition: parseNullableInteger(draft.sexualPosition),
					showTribes: draft.showTribes,
					grindrTribes: draft.grindrTribes,
					relationshipStatus: parseNullableInteger(draft.relationshipStatus),
					lookingFor: draft.lookingFor,
					meetAt: draft.meetAt,
					nsfw: parseNullableInteger(draft.nsfw),
					genders: draft.genders,
					pronouns: draft.pronouns,
					hivStatus: parseNullableInteger(draft.hivStatus),
					lastTestedDate: parseDateInput(draft.lastTestedDate),
					sexualHealth: draft.sexualHealth,
					vaccines: draft.vaccines,
					socialNetworks: {
						instagram: { userId: draft.instagram.trim() || null },
						twitter: { userId: draft.twitter.trim() || null },
						facebook: { userId: draft.facebook.trim() || null },
					},
				},
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to save profile (${response.status})`);
			}

			toast.success("Profile updated");
			await loadProfile();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update profile";
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetDraft = () => {
		setDraft(savedDraft);
	};

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Logout failed:", error);
		}
	};

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-5xl">
				<header className="mb-6">
					<h1 className="app-title mb-2">Settings</h1>
					<p className="app-subtitle">
						Edit the parts of your profile that matter most without losing the
						overall snapshot.
					</p>
				</header>

				<div className="surface-card p-5 sm:p-6">
					{isLoadingProfile ? (
						<p className="text-sm font-medium text-[var(--text-muted)]">
							Loading your profile...
						</p>
					) : profileError ? (
						<div className="grid gap-3">
							<p className="text-sm font-medium text-[var(--text-muted)]">
								Could not load profile details.
							</p>
							<p className="text-sm text-[var(--text-muted)]">{profileError}</p>
						</div>
					) : (
						<div className="grid gap-6">
							<div className="rounded-[24px] bg-[var(--surface-2)] p-4 sm:p-5">
								<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
									<div className="flex items-center gap-4">
										<div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-[var(--accent-contrast)] shadow-sm">
											{draftInitials}
										</div>
										<div>
											<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
												Profile Editor
											</p>
											<h2 className="mt-1 text-2xl font-semibold leading-tight">
												{draftDisplayName}
											</h2>
											<div className="mt-2 flex flex-wrap gap-2">
												<span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm font-medium text-[var(--text-muted)]">
													{selectedRelationshipLabel}
												</span>
												<span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm font-medium text-[var(--text-muted)]">
													{selectedBodyTypeLabel}
												</span>
												<span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm font-medium text-[var(--text-muted)]">
													{tagList.length} tags
												</span>
											</div>
										</div>
									</div>

									<div className="flex flex-col items-start gap-3 lg:items-end">
										<div className="flex flex-wrap items-center gap-3">
											<button
												type="button"
												onClick={handleSaveProfile}
												disabled={!canSave}
												className="btn-accent px-4 py-2.5 disabled:cursor-not-allowed"
											>
												{isSaving ? "Saving..." : "Save changes"}
											</button>
											<button
												type="button"
												onClick={handleResetDraft}
												disabled={!hasChanges || isSaving}
												className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
											>
												Reset
											</button>
										</div>
										<p className="text-sm text-[var(--text-muted)]">
											{hasChanges
												? "Unsaved changes are ready to push."
												: "Everything here matches the current profile state."}
										</p>
									</div>
								</div>
							</div>

							<div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
								<div className="grid gap-5">
									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="Pictures"
											description="Photo slots"
											icon={ImageOff}
										/>
										<div className="rounded-2xl bg-[var(--surface-2)] p-4">
											<p className="text-sm font-medium">
												Pictures are not implemented yet.
											</p>
											<p className="mt-1 text-sm text-[var(--text-muted)]">
												Your profile currently has{" "}
												{profile?.medias?.length ?? 0} picture
												{(profile?.medias?.length ?? 0) === 1 ? "" : "s"}. Photo
												editing will plug into the dedicated media endpoints
												later.
											</p>
										</div>
									</div>

									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="Profile"
											description="Name, bio, and tags"
											icon={Sparkles}
										/>
										<div className="grid gap-4">
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Display Name
												</label>
												<input
													type="text"
													maxLength={15}
													value={draft.displayName}
													onChange={(event) =>
														handleDraftChange("displayName", event.target.value)
													}
													className="input-field"
													placeholder="3 to 15 characters"
												/>
												<p className="mt-2 text-sm text-[var(--text-muted)]">
													{displayNameError ??
														`${draft.displayName.trim().length || 0}/15 characters`}
												</p>
											</div>

											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													About Me
												</label>
												<textarea
													value={draft.aboutMe}
													maxLength={255}
													onChange={(event) =>
														handleDraftChange("aboutMe", event.target.value)
													}
													className="input-field min-h-32 resize-y"
													placeholder="Up to 255 characters"
												/>
												<p className="mt-2 text-sm text-[var(--text-muted)]">
													{aboutMeError ??
														`${draft.aboutMe.length}/255 characters`}
												</p>
											</div>

											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													My Tags
												</label>
												<input
													type="text"
													value={draft.profileTagsText}
													onChange={(event) =>
														handleDraftChange(
															"profileTagsText",
															event.target.value,
														)
													}
													className="input-field"
													placeholder="Keyword tags, separated by commas"
												/>
												<div className="mt-3 flex flex-wrap gap-2">
													{tagList.length > 0 ? (
														tagList.map((tag) => (
															<span
																key={tag}
																className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-sm font-medium"
															>
																{tag}
															</span>
														))
													) : (
														<p className="text-sm text-[var(--text-muted)]">
															No tags added yet.
														</p>
													)}
												</div>
											</div>
										</div>
									</div>

									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="States"
											description="Visible stats and profile traits"
											icon={Ruler}
										/>
										<div className="grid gap-4">
											<div className="grid gap-4 md:grid-cols-2">
												<ToggleRow
													checked={draft.showAge}
													onChange={(checked) =>
														handleDraftChange("showAge", checked)
													}
													label="Show Age"
													description="Control whether age is visible on profile."
												/>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Age
													</label>
													<input
														type="number"
														inputMode="numeric"
														value={draft.age}
														onChange={(event) =>
															handleDraftChange("age", event.target.value)
														}
														className="input-field"
														placeholder="Age"
													/>
												</div>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Height
													</label>
													<input
														type="number"
														inputMode="numeric"
														value={draft.height}
														onChange={(event) =>
															handleDraftChange("height", event.target.value)
														}
														className="input-field"
														placeholder="Height in cm"
													/>
												</div>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Weight
													</label>
													<input
														type="number"
														inputMode="numeric"
														value={draft.weight}
														onChange={(event) =>
															handleDraftChange("weight", event.target.value)
														}
														className="input-field"
														placeholder="Weight in kg"
													/>
												</div>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Ethnicity
													</label>
													<select
														value={draft.ethnicity}
														onChange={(event) =>
															handleDraftChange("ethnicity", event.target.value)
														}
														className="input-field"
													>
														<option value="">Not set</option>
														{ethnicityOptions.map((option) => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
												</div>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Body Type
													</label>
													<select
														value={draft.bodyType}
														onChange={(event) =>
															handleDraftChange("bodyType", event.target.value)
														}
														className="input-field"
													>
														<option value="">Not set</option>
														{bodyTypeOptions.map((option) => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
												</div>
												<ToggleRow
													checked={draft.showPosition}
													onChange={(checked) =>
														handleDraftChange("showPosition", checked)
													}
													label="Show Position"
													description="Let people see your position on profile."
												/>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Position
													</label>
													<select
														value={draft.sexualPosition}
														onChange={(event) =>
															handleDraftChange(
																"sexualPosition",
																event.target.value,
															)
														}
														className="input-field"
													>
														<option value="">Not set</option>
														{positionOptions.map((option) => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
												</div>
												<ToggleRow
													checked={draft.showTribes}
													onChange={(checked) =>
														handleDraftChange("showTribes", checked)
													}
													label="Show Tribes"
													description="Choose whether your tribes are visible publicly."
												/>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Relationship Status
													</label>
													<select
														value={draft.relationshipStatus}
														onChange={(event) =>
															handleDraftChange(
																"relationshipStatus",
																event.target.value,
															)
														}
														className="input-field"
													>
														<option value="">Not set</option>
														{relationshipStatusOptions.map((option) => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
												</div>
											</div>

											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Tribes
												</p>
												<ChipGroup
													options={tribeOptions}
													selected={draft.grindrTribes}
													onToggle={(value) =>
														toggleMultiValue("grindrTribes", value)
													}
												/>
											</div>
										</div>
									</div>

									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="Expectations"
											description="What you're open to and how"
											icon={Sparkles}
										/>
										<div className="grid gap-4">
											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Looking For
												</p>
												<ChipGroup
													options={lookingForOptions}
													selected={draft.lookingFor}
													onToggle={(value) =>
														toggleMultiValue("lookingFor", value)
													}
												/>
											</div>
											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Meet At
												</p>
												<ChipGroup
													options={meetAtOptions}
													selected={draft.meetAt}
													onToggle={(value) =>
														toggleMultiValue("meetAt", value)
													}
												/>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Accept NSFW Pics
												</label>
												<select
													value={draft.nsfw}
													onChange={(event) =>
														handleDraftChange("nsfw", event.target.value)
													}
													className="input-field"
												>
													<option value="">Not set</option>
													{nsfwOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
										</div>
									</div>

									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="Identity"
											description="Managed identity fields"
											icon={BadgeInfo}
										/>
										<div className="grid gap-4">
											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Gender
												</p>
												{genderOptions.length > 0 ? (
													<ChipGroup
														options={genderOptions}
														selected={draft.genders}
														onToggle={(value) =>
															toggleMultiValue("genders", value)
														}
													/>
												) : (
													<p className="text-sm text-[var(--text-muted)]">
														Gender options are unavailable right now.
													</p>
												)}
											</div>
											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Pronouns
												</p>
												{pronounOptions.length > 0 ? (
													<ChipGroup
														options={pronounOptions}
														selected={draft.pronouns}
														onToggle={(value) =>
															toggleMultiValue("pronouns", value)
														}
													/>
												) : (
													<p className="text-sm text-[var(--text-muted)]">
														Pronoun options are unavailable right now.
													</p>
												)}
											</div>
										</div>
									</div>

									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="Health"
											description="Status, testing, and practices"
											icon={ShieldPlus}
										/>
										<div className="grid gap-4">
											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														HIV Status
													</label>
													<select
														value={draft.hivStatus}
														onChange={(event) =>
															handleDraftChange("hivStatus", event.target.value)
														}
														className="input-field"
													>
														<option value="">Not set</option>
														{hivStatusOptions.map((option) => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
												</div>
												<div>
													<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
														Last Tested
													</label>
													<input
														type="date"
														value={draft.lastTestedDate}
														onChange={(event) =>
															handleDraftChange(
																"lastTestedDate",
																event.target.value,
															)
														}
														className="input-field"
													/>
												</div>
											</div>

											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Health Practices
												</p>
												<ChipGroup
													options={sexualHealthOptions}
													selected={draft.sexualHealth}
													onToggle={(value) =>
														toggleMultiValue("sexualHealth", value)
													}
												/>
											</div>
											<div>
												<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Vaccinations
												</p>
												<ChipGroup
													options={vaccineOptions}
													selected={draft.vaccines}
													onToggle={(value) =>
														toggleMultiValue("vaccines", value)
													}
												/>
											</div>
										</div>
									</div>

									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<CategoryHeader
											title="Social"
											description="Public handles and usernames"
											icon={AtSign}
										/>
										<div className="grid gap-4 md:grid-cols-3">
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Insta username
												</label>
												<input
													type="text"
													value={draft.instagram}
													onChange={(event) =>
														handleDraftChange("instagram", event.target.value)
													}
													className="input-field"
													placeholder="username"
												/>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													X handle
												</label>
												<input
													type="text"
													value={draft.twitter}
													onChange={(event) =>
														handleDraftChange("twitter", event.target.value)
													}
													className="input-field"
													placeholder="username"
												/>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													Facebook username
												</label>
												<input
													type="text"
													value={draft.facebook}
													onChange={(event) =>
														handleDraftChange("facebook", event.target.value)
													}
													className="input-field"
													placeholder="username"
												/>
											</div>
										</div>
									</div>
								</div>

								<div className="grid gap-4">
									<div className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
										<p className="text-sm font-medium text-[var(--text-muted)]">
											Other Infomation
										</p>
										<div className="mt-4 grid gap-3">
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm text-[var(--text-muted)]">
													User ID
												</span>
												<span className="text-sm font-semibold">
													{profile?.profileId ?? userId ?? "Unknown"}
												</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					<div className="mt-6 flex flex-wrap items-center gap-3">
						<Link
							to="/"
							className="rounded-xl border border-[var(--border)] px-4 py-2.5 font-medium"
						>
							Back to Browse
						</Link>
						<button onClick={handleLogout} className="btn-accent px-4 py-2.5">
							Logout
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
