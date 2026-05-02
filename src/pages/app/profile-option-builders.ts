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
	{ value: 1, key: "profile.labels.tribes.bear" },
	{ value: 2, key: "profile.labels.tribes.clean_cut" },
	{ value: 3, key: "profile.labels.tribes.daddy" },
	{ value: 4, key: "profile.labels.tribes.discreet" },
	{ value: 5, key: "profile.labels.tribes.geek" },
	{ value: 6, key: "profile.labels.tribes.jock" },
	{ value: 7, key: "profile.labels.tribes.leather" },
	{ value: 8, key: "profile.labels.tribes.otter" },
	{ value: 9, key: "profile.labels.tribes.poz" },
	{ value: 10, key: "profile.labels.tribes.rugged" },
	{ value: 11, key: "profile.labels.tribes.sober" },
	{ value: 12, key: "profile.labels.tribes.trans" },
	{ value: 13, key: "profile.labels.tribes.twink" },
];

const LOOKING_FOR_DEFS: readonly OptionDef[] = [
	{ value: 2, key: "profile.labels.looking_for.chat" },
	{ value: 3, key: "profile.labels.looking_for.dates" },
	{ value: 4, key: "profile.labels.looking_for.friends" },
	{ value: 5, key: "profile.labels.looking_for.networking" },
	{ value: 6, key: "profile.labels.looking_for.relationship" },
	{ value: 7, key: "profile.labels.looking_for.hookups" },
];

const RELATIONSHIP_STATUS_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.relationship_status.single" },
	{ value: 2, key: "profile.labels.relationship_status.dating" },
	{ value: 3, key: "profile.labels.relationship_status.exclusive" },
	{ value: 4, key: "profile.labels.relationship_status.committed" },
	{ value: 5, key: "profile.labels.relationship_status.partnered" },
	{ value: 6, key: "profile.labels.relationship_status.engaged" },
	{ value: 7, key: "profile.labels.relationship_status.married" },
	{ value: 8, key: "profile.labels.relationship_status.open_relationship" },
];

const BODY_TYPE_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.body_type.toned" },
	{ value: 2, key: "profile.labels.body_type.average" },
	{ value: 3, key: "profile.labels.body_type.large" },
	{ value: 4, key: "profile.labels.body_type.muscular" },
	{ value: 5, key: "profile.labels.body_type.slim" },
	{ value: 6, key: "profile.labels.body_type.stocky" },
];

const ETHNICITY_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.ethnicity.asian" },
	{ value: 2, key: "profile.labels.ethnicity.black" },
	{ value: 3, key: "profile.labels.ethnicity.latino" },
	{ value: 4, key: "profile.labels.ethnicity.middle_eastern" },
	{ value: 5, key: "profile.labels.ethnicity.mixed" },
	{ value: 6, key: "profile.labels.ethnicity.native_american" },
	{ value: 7, key: "profile.labels.ethnicity.white" },
	{ value: 8, key: "profile.labels.ethnicity.other" },
	{ value: 9, key: "profile.labels.ethnicity.south_asian" },
];

const SEXUAL_POSITION_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.sexual_position.top" },
	{ value: 2, key: "profile.labels.sexual_position.bottom" },
	{ value: 3, key: "profile.labels.sexual_position.versatile" },
	{ value: 4, key: "profile.labels.sexual_position.vers_bottom" },
	{ value: 5, key: "profile.labels.sexual_position.vers_top" },
	{ value: 6, key: "profile.labels.sexual_position.side" },
];

const MEET_AT_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.meet_at.my_place" },
	{ value: 2, key: "profile.labels.meet_at.your_place" },
	{ value: 3, key: "profile.labels.meet_at.bar" },
	{ value: 4, key: "profile.labels.meet_at.coffee_shop" },
	{ value: 5, key: "profile.labels.meet_at.restaurant" },
];

const NSFW_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.nsfw.never" },
	{ value: 2, key: "profile.labels.nsfw.not_at_first" },
	{ value: 3, key: "profile.labels.nsfw.yes_please" },
];

const HIV_STATUS_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.hiv_status.negative" },
	{ value: 2, key: "profile.labels.hiv_status.negative_prep" },
	{ value: 3, key: "profile.labels.hiv_status.positive" },
	{ value: 4, key: "profile.labels.hiv_status.positive_undetectable" },
];

const SEXUAL_HEALTH_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.sexual_health.condoms" },
	{ value: 2, key: "profile.labels.sexual_health.doxy_pep" },
	{ value: 3, key: "profile.labels.sexual_health.prep" },
	{ value: 4, key: "profile.labels.sexual_health.hiv_undetectable" },
	{ value: 5, key: "profile.labels.sexual_health.discuss" },
];

const VACCINE_DEFS: readonly OptionDef[] = [
	{ value: 1, key: "profile.labels.vaccines.covid" },
	{ value: 2, key: "profile.labels.vaccines.monkeypox" },
	{ value: 3, key: "profile.labels.vaccines.meningitis" },
];


export function getLookingForOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, LOOKING_FOR_DEFS);
}

export function getLookingForLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getLookingForOptions(t));
}

export function getRelationshipStatusOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, RELATIONSHIP_STATUS_DEFS);
}

export function getRelationshipStatusLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getRelationshipStatusOptions(t));
}

export function getBodyTypeOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, BODY_TYPE_DEFS);
}

export function getBodyTypeLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getBodyTypeOptions(t));
}

export function getEthnicityOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, ETHNICITY_DEFS);
}

export function getEthnicityLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getEthnicityOptions(t));
}

export function getSexualPositionOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, SEXUAL_POSITION_DEFS);
}

export function getSexualPositionLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getSexualPositionOptions(t));
}

export function getMeetAtOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, MEET_AT_DEFS);
}

export function getMeetAtLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getMeetAtOptions(t));
}

export function getNsfwOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, NSFW_DEFS);
}

export function getNsfwLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getNsfwOptions(t));
}

export function getHivStatusOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, HIV_STATUS_DEFS);
}

export function getHivStatusLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getHivStatusOptions(t));
}

export function getSexualHealthOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, SEXUAL_HEALTH_DEFS);
}

export function getSexualHealthLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getSexualHealthOptions(t));
}

export function getVaccineOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, VACCINE_DEFS);
}

export function getVaccineLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getVaccineOptions(t));
}

export function getTribeOptions(t: TFunction): ManagedOption[] {
	return buildManagedOptions(t, TRIBE_DEFS);
}

export function getTribeLabelMap(t: TFunction): Record<number, string> {
	return toLabelMap(getTribeOptions(t));
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