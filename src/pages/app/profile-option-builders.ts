import type { TFunction } from "i18next";
import type { ManagedOption } from "./GridPage.types";

type OptionDef = {
	value: number;
	key: string;
};

function buildManagedOptions(
	t: TFunction,
	definitions: readonly OptionDef[],
): ManagedOption[] {
	return definitions.map(({ value, key }) => ({
		value,
		label: t(key),
	}));
}

function toLabelMap(options: readonly ManagedOption[]): Record<number, string> {
	return Object.fromEntries(
		options.map((option) => [option.value, option.label]),
	) as Record<number, string>;
}

const TRIBE_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile_editor.labels.tribes.bear" },
	{ value: 2, key: "profile_editor.labels.tribes.clean_cut" },
	{ value: 3, key: "profile_editor.labels.tribes.daddy" },
	{ value: 4, key: "profile_editor.labels.tribes.discreet" },
	{ value: 5, key: "profile_editor.labels.tribes.geek" },
	{ value: 6, key: "profile_editor.labels.tribes.jock" },
	{ value: 7, key: "profile_editor.labels.tribes.leather" },
	{ value: 8, key: "profile_editor.labels.tribes.otter" },
	{ value: 9, key: "profile_editor.labels.tribes.poz" },
	{ value: 10, key: "profile_editor.labels.tribes.rugged" },
	{ value: 11, key: "profile_editor.labels.tribes.sober" },
	{ value: 12, key: "profile_editor.labels.tribes.trans" },
	{ value: 13, key: "profile_editor.labels.tribes.twink" },
];

const LOOKING_FOR_DEFS: readonly OptionDef[] = [
	{ value: 2, key: "profile_editor.labels.looking_for.chat" },
	{ value: 3, key: "profile_editor.labels.looking_for.dates" },
	{ value: 4, key: "profile_editor.labels.looking_for.friends" },
	{ value: 5, key: "profile_editor.labels.looking_for.networking" },
	{ value: 6, key: "profile_editor.labels.looking_for.relationship" },
	{ value: 7, key: "profile_editor.labels.looking_for.hookups" },
];

const RELATIONSHIP_STATUS_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile_editor.labels.relationship_status.single" },
	{ value: 2, key: "profile_editor.labels.relationship_status.dating" },
	{ value: 3, key: "profile_editor.labels.relationship_status.exclusive" },
	{ value: 4, key: "profile_editor.labels.relationship_status.committed" },
	{ value: 5, key: "profile_editor.labels.relationship_status.partnered" },
	{ value: 6, key: "profile_editor.labels.relationship_status.engaged" },
	{ value: 7, key: "profile_editor.labels.relationship_status.married" },
	{ value: 8, key: "profile_editor.labels.relationship_status.open_relationship" },
];

const BODY_TYPE_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile_editor.labels.body_type.toned" },
	{ value: 2, key: "profile_editor.labels.body_type.average" },
	{ value: 3, key: "profile_editor.labels.body_type.large" },
	{ value: 4, key: "profile_editor.labels.body_type.muscular" },
	{ value: 5, key: "profile_editor.labels.body_type.slim" },
	{ value: 6, key: "profile_editor.labels.body_type.stocky" },
];

const SEXUAL_POSITION_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile_editor.labels.sexual_position.top" },
	{ value: 2, key: "profile_editor.labels.sexual_position.bottom" },
	{ value: 3, key: "profile_editor.labels.sexual_position.versatile" },
	{ value: 4, key: "profile_editor.labels.sexual_position.vers_bottom" },
	{ value: 5, key: "profile_editor.labels.sexual_position.vers_top" },
	{ value: 6, key: "profile_editor.labels.sexual_position.side" },
];

const MEET_AT_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile_editor.labels.meet_at.my_place" },
	{ value: 2, key: "profile_editor.labels.meet_at.your_place" },
	{ value: 3, key: "profile_editor.labels.meet_at.bar" },
	{ value: 4, key: "profile_editor.labels.meet_at.coffee_shop" },
	{ value: 5, key: "profile_editor.labels.meet_at.restaurant" },
];

const NSFW_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile_editor.labels.nsfw.never" },
	{ value: 2, key: "profile_editor.labels.nsfw.not_at_first" },
	{ value: 3, key: "profile_editor.labels.nsfw.yes_please" },
];

export function getTribeOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, TRIBE_DEFS);
}

export function getLookingForOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, LOOKING_FOR_DEFS);
}

export function getRelationshipStatusOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, RELATIONSHIP_STATUS_DEFS);
}

export function getRelationshipStatusLabelMap(
	t: TFunction,
): Record<number, string> {
	return toLabelMap(getRelationshipStatusOptions(t));
}

export function getBodyTypeOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, BODY_TYPE_DEFS);
}

export function getBodyTypeLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getBodyTypeOptions(t));
}

export function getSexualPositionOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, SEXUAL_POSITION_DEFS);
}

export function getMeetAtOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, MEET_AT_DEFS);
}

export function getNsfwOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, NSFW_DEFS);
}

export function getSexualPositionFilterOptions(
	t: TFunction,
	anyLabel: string,
): Array<{ value: string; label: string }> {
	return [
		{ value: "", label: anyLabel },
		...getSexualPositionOptions(t).map((option) => ({
			value: String(option.value),
			label: option.label,
		})),
	];
}