import i18n from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { SUPPORTED_LOCALES } from "./utils/locales";

const i18nBackendBaseUrl = (
	import.meta.env.VITE_I18N_BASE_URL ?? import.meta.env.BASE_URL
).replace(/\/+$/, "");

const preloadLanguages = Array.from(
	new Set(SUPPORTED_LOCALES.map((locale) => locale.split("-")[0])),
);

i18n
	.use(Backend)
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		fallbackLng: ["en"],
		supportedLngs: SUPPORTED_LOCALES,
		nonExplicitSupportedLngs: true,
		load: "languageOnly",
		defaultNS: "translation",
		ns: ["translation"],
		returnEmptyString: false,
		interpolation: {
			escapeValue: false,
		},
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
		},
		backend: {
			loadPath: `${i18nBackendBaseUrl}/locales/{{lng}}/{{ns}}.json`,
		},
	})
	.then(() => {
		void i18n.loadLanguages(preloadLanguages);
	});

export default i18n;
