import i18n from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

const i18nBackendBaseUrl = (
	import.meta.env.VITE_I18N_BASE_URL ?? "https://translate.imaoreo.dev"
).replace(/\/+$/, "");

i18n
	.use(Backend)
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		fallbackLng: "en",
		supportedLngs: ["en", "de"],
		load: "languageOnly",
		defaultNS: "translation",
		ns: ["translation"],
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
	});

export default i18n;
