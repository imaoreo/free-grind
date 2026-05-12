export const UNIT_PRESETS = ["world", "uk", "american"] as const;

export type UnitsPreset = (typeof UNIT_PRESETS)[number];

const POUNDS_PER_KG = 2.2046226218;
const GRAMS_PER_KG = 1000;

function formatMetricDistance(distanceMeters: number): string {
	if (distanceMeters < 1000) {
		return `${Math.max(0, Math.round(distanceMeters))} m`;
	}

	return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatImperialDistance(distanceMeters: number): string {
	const miles = distanceMeters / 1609.344;
	if (miles <= 0) {
		return "0 mi";
	}

	if (miles < 0.1) {
		return "<0.1 mi";
	}

	if (miles < 10) {
		return `${miles.toFixed(1)} mi`;
	}

	return `${Math.round(miles)} mi`;
}

export function formatDistanceForUnits(
	distanceMeters: number | null | undefined,
	unitsPreset: UnitsPreset,
	t?: (key: string, options?: any) => string,
): string {
	if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
		return t ? t("browse_page.distance_hidden") : "hidden";
	}

	if (unitsPreset === "american") {
		return formatImperialDistance(distanceMeters);
	}

	return formatMetricDistance(distanceMeters);
}

function cmToFeetAndInches(valueCm: number): { feet: number; inches: number } {
	const totalInches = Math.max(0, Math.round(valueCm / 2.54));
	const feet = Math.floor(totalInches / 12);
	const inches = totalInches % 12;
	return { feet, inches };
}

export function cmToInches(valueCm: number): number {
	return valueCm / 2.54;
}

export function inchesToCm(valueInches: number): number {
	return valueInches * 2.54;
}

export function gramsToKg(valueGrams: number): number {
	return valueGrams / GRAMS_PER_KG;
}

export function kgToGrams(valueKg: number): number {
	return valueKg * GRAMS_PER_KG;
}

export function gramsToPounds(valueGrams: number): number {
	return gramsToKg(valueGrams) * POUNDS_PER_KG;
}

export function poundsToGrams(valuePounds: number): number {
	return kgToGrams(valuePounds / POUNDS_PER_KG);
}

export function formatHeightForUnits(
	valueCm: number | null | undefined,
	unitsPreset: UnitsPreset,
	t?: (key: string, options?: any) => string,
): string {
	if (valueCm == null || !Number.isFinite(valueCm)) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	if (unitsPreset === "world") {
		return `${Math.round(valueCm)}cm`;
	}

	const { feet, inches } = cmToFeetAndInches(valueCm);
	return `${feet} ft ${inches} in`;
}

export function formatWeightForUnits(
	valueGrams: number | null | undefined,
	unitsPreset: UnitsPreset,
	t?: (key: string, options?: any) => string,
): string {
	if (valueGrams == null || !Number.isFinite(valueGrams)) {
		return t ? t("browse_page.not_set") : "Not set";
	}

	if (unitsPreset === "american") {
		const pounds = Math.max(0, Math.round(gramsToPounds(valueGrams)));
		return `${pounds}lb`;
	}

	return `${Math.max(0, Math.round(gramsToKg(valueGrams)))}kg`;
}
