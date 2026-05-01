import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
	en: {
		translation: {
			settings: {
				title: "Settings",
				subtitle: "Choose what you want to manage.",
				language: "Language",
				language_description: "Choose your preferred language.",
				profile_editor: "Profile Editor",
				profile_editor_desc: "Edit profile details, identity, and preferences.",
				customizability: "Customizability",
				customizability_desc: "Change color scheme and accent color.",
				about: "About Free Grind",
				about_desc: "Project goals, credits, licence, and documentation links.",
				api_inspector: "API Inspector",
				api_inspector_desc: "View request and response history for debugging.",
				my_albums: "My Albums",
				my_albums_desc: "Create, rename, and delete private albums.",
				export_chat: "Export Chat Data",
				export_chat_desc: "Download all locally stored messages as a JSON file.",
				check_updates: "Check for Updates",
				check_now: "Check Now",
				environment: "Environment",
				switching: "Switching...",
				checking: "Checking...",
				exporting: "Exporting...",
				logout: "Logout",
				back_to_browse: "Back to Browse",
				ota_available_only_tauri: "OTA updates are only available in the Tauri app.",
				latest_version: "You already have the latest version.",
				update_installed: "Update installed. Reloading now...",
				failed_update_check: "Failed to check or apply update.",
				switched_and_updated: "Switched to {{channel}} and applied update. Reloading...",
				switched_channel: "Switched to {{channel}}. Reloading...",
				failed_switch_env: "Failed to switch update environment.",
			},
			browse: {
				online: "Online",
				offline: "Offline",
			},
		},
	},
	de: {
		translation: {
			settings: {
				title: "Einstellungen",
				subtitle: "Wähle aus, was du verwalten möchtest.",
				language: "Sprache",
				language_description: "Wähle deine bevorzugte Sprache.",
				profile_editor: "Profil-Editor",
				profile_editor_desc:
					"Bearbeite Profildetails, Identität und Einstellungen.",
				customizability: "Personalisierung",
				customizability_desc: "Farbschema und Akzentfarbe ändern.",
				about: "Über Free Grind",
				about_desc: "Projektziele, Credits, Lizenz und Dokumentation.",
				api_inspector: "API-Inspektor",
				api_inspector_desc: "Anfrage- und Antworthistorie zum Debuggen anzeigen.",
				my_albums: "Meine Alben",
				my_albums_desc: "Private Alben erstellen, umbenennen und löschen.",
				export_chat: "Chat-Daten exportieren",
				export_chat_desc:
					"Alle lokal gespeicherten Nachrichten als JSON herunterladen.",
				check_updates: "Auf Updates prüfen",
				check_now: "Jetzt prüfen",
				environment: "Umgebung",
				switching: "Wechsle...",
				checking: "Prüfe...",
				exporting: "Exportiere...",
				logout: "Abmelden",
				back_to_browse: "Zurück zur Übersicht",
				ota_available_only_tauri: "OTA-Updates sind nur in der Tauri-App verfügbar.",
				latest_version: "Du hast bereits die neueste Version.",
				update_installed: "Update installiert. Wird neu geladen...",
				failed_update_check: "Fehler beim Prüfen oder Anwenden des Updates.",
				switched_and_updated: "Zu {{channel}} gewechselt und Update angewendet. Lade neu...",
				switched_channel: "Zu {{channel}} gewechselt. Lade neu...",
				failed_switch_env: "Fehler beim Wechseln der Update-Umgebung.",
			},
			browse: {
				online: "Online",
				offline: "Offline",
			},
		},
	},
};

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: "en",
		interpolation: {
			escapeValue: false,
		},
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
		},
	});

export default i18n;
