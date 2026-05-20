export const VISITING_MODES = ["AUTO", "OFF", "ON"] as const;

export type VisitingMode = (typeof VISITING_MODES)[number];

const VISITING_MODE_TRANSLATION_KEYS: Record<
	VisitingMode,
	"auto" | "home" | "visiting"
> = {
	AUTO: "auto",
	OFF: "home",
	ON: "visiting",
};

export function isVisitingMode(value: unknown): value is VisitingMode {
	return (
		typeof value === "string" && VISITING_MODES.includes(value as VisitingMode)
	);
}

export function getVisitingModeTranslationKey(mode: VisitingMode) {
	return VISITING_MODE_TRANSLATION_KEYS[mode];
}
