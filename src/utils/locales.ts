const localeModules = import.meta.glob("../../public/locales/*/translation.json");

const localeCodeRegex = /\/public\/locales\/([^/]+)\/translation\.json$/;
const DEFAULT_LOCALES = ["en", "de"];

function getDisplayName(localeCode: string): string {
	try {
		const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
		const name = displayNames.of(localeCode);
		if (!name) {
			return localeCode;
		}
		return `${name} (${localeCode})`;
	} catch {
		return localeCode;
	}
}

const detectedLocales = Object.keys(localeModules)
	.map((path) => {
		const match = path.match(localeCodeRegex);
		return match?.[1] ?? null;
	})
	.filter((locale): locale is string => Boolean(locale))
	.sort((a, b) => a.localeCompare(b));

export const SUPPORTED_LOCALES =
	detectedLocales.length > 0 ? detectedLocales : DEFAULT_LOCALES;

export const SUPPORTED_LOCALE_OPTIONS = SUPPORTED_LOCALES.map((localeCode) => ({
	value: localeCode,
	label: getDisplayName(localeCode),
}));

export function resolveSupportedLocale(locale: string): string {
	if (SUPPORTED_LOCALES.includes(locale)) {
		return locale;
	}

	const languageOnly = locale.split("-")[0];
	if (SUPPORTED_LOCALES.includes(languageOnly)) {
		return languageOnly;
	}

	if (SUPPORTED_LOCALES.includes("en")) {
		return "en";
	}

	return SUPPORTED_LOCALES[0] ?? "en";
}
