import {
	createContext,
	useContext,
	useReducer,
	useEffect,
	ReactNode,
	useCallback,
	useRef,
	useState,
} from "react";
import z from "zod";
import { appLog } from "../utils/logger";
import { geohashSchema } from "../utils/geohash";
import { UNIT_PRESETS, type UnitsPreset } from "../utils/units";
import { REVEAL_STRENGTH_SUBTLE, REVEAL_STRENGTH_PRONOUNCED, type RevealStrength } from "../config/ui-constants";
import { getSetting, setSetting } from "../services/chatDb";
import { useAuth } from "./useAuth";

export const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export interface AccentPreset {
	name: string;
	color: string;
	contrast: string;
}

type Rgb = { r: number; g: number; b: number };

function normalizeHexColor(value: string): string | null {
	const cleaned = value.trim().replace(/^#/, "");
	if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
		return `#${cleaned
			.split("")
			.map((char) => char + char)
			.join("")
			.toLowerCase()}`;
	}
	if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
		return `#${cleaned.toLowerCase()}`;
	}
	return null;
}

function hexToRgb(value: string): Rgb | null {
	const normalized = normalizeHexColor(value);
	if (!normalized) {
		return null;
	}

	return {
		r: parseInt(normalized.slice(1, 3), 16),
		g: parseInt(normalized.slice(3, 5), 16),
		b: parseInt(normalized.slice(5, 7), 16),
	};
}

function rgbToHex(value: Rgb): string {
	const toHex = (channel: number) =>
		Math.max(0, Math.min(255, Math.round(channel)))
			.toString(16)
			.padStart(2, "0");

	return `#${toHex(value.r)}${toHex(value.g)}${toHex(value.b)}`;
}

function toLinear(channel: number): number {
	const normalized = channel / 255;
	if (normalized <= 0.03928) {
		return normalized / 12.92;
	}
	return ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(color: Rgb): number {
	return (
		0.2126 * toLinear(color.r) +
		0.7152 * toLinear(color.g) +
		0.0722 * toLinear(color.b)
	);
}

function getContrastRatio(a: Rgb, b: Rgb): number {
	const luminanceA = getRelativeLuminance(a);
	const luminanceB = getRelativeLuminance(b);
	const lighter = Math.max(luminanceA, luminanceB);
	const darker = Math.min(luminanceA, luminanceB);
	return (lighter + 0.05) / (darker + 0.05);
}

function mixColor(start: Rgb, end: Rgb, weight: number): Rgb {
	const clampedWeight = Math.max(0, Math.min(1, weight));
	return {
		r: start.r + (end.r - start.r) * clampedWeight,
		g: start.g + (end.g - start.g) * clampedWeight,
		b: start.b + (end.b - start.b) * clampedWeight,
	};
}

function getReadableAccentColor(
	accentColor: string,
	backgroundColors: string[],
	fallbackTextColor: string,
	targetContrast = 4.5,
): string {
	const accentRgb = hexToRgb(accentColor);
	const textRgb = hexToRgb(fallbackTextColor);
	const backgroundRgbs = backgroundColors
		.map((value) => hexToRgb(value))
		.filter((value): value is Rgb => value !== null);

	if (!accentRgb || !textRgb || backgroundRgbs.length === 0) {
		return accentColor;
	}

	const meetsTargetContrast = (candidate: Rgb) =>
		backgroundRgbs.every(
			(background) => getContrastRatio(candidate, background) >= targetContrast,
		);

	if (meetsTargetContrast(accentRgb)) {
		return rgbToHex(accentRgb);
	}

	for (let weight = 0.1; weight <= 1; weight += 0.05) {
		const candidate = mixColor(accentRgb, textRgb, weight);
		if (meetsTargetContrast(candidate)) {
			return rgbToHex(candidate);
		}
	}

	return rgbToHex(textRgb);
}

export const ACCENT_PRESETS: AccentPreset[] = [
	{ name: "Amber", color: "#ffcc01", contrast: "#1a1a1a" },
	{ name: "Red", color: "#ff4757", contrast: "#ffffff" },
	{ name: "Purple", color: "#7c3aed", contrast: "#ffffff" },
	{ name: "Blue", color: "#3b82f6", contrast: "#ffffff" },
	{ name: "Green", color: "#22c55e", contrast: "#1a1a1a" },
	{ name: "Pink", color: "#ec4899", contrast: "#ffffff" },
	{ name: "Orange", color: "#f97316", contrast: "#1a1a1a" },
	{ name: "Teal", color: "#14b8a6", contrast: "#1a1a1a" },
];

// geohash/locationName/useAutoLocation are per-profile (see the
// settingsReady-gated load/save effect below, backed by chatDb) rather than
// part of this shared localStorage blob, so they need safe defaults here —
// old blobs still on disk may carry a stale geohash, and the local storage
// write no longer includes any of the three going forward.
const preferencesSchema = z.object({
	geohash: geohashSchema.nullable().default(null),
	locationName: z.string().nullable().optional(),
	colorScheme: z.enum(["system", "light", "dark"]).default("dark"),
	accentColor: z.string().default("#ffcc01"),
	accentContrast: z.string().default("#1a1a1a"),
	mobileGridColumns: z.enum(["2", "3"]).default("3"),
	unitsPreset: z.enum(UNIT_PRESETS).default("world"),
	blurIncomingMedia: z.boolean().default(false),
	blurGridProfilePictures: z.boolean().default(false),
	developerMode: z.boolean().default(false),
	showDebugInfo: z.boolean().default(false),
	testReminderDisabled: z.boolean().default(false),
	useAutoLocation: z.boolean().default(false),
	rightNowTestMode: z.boolean().default(false),
	activeRightNowId: z.number().nullable().optional(),
	activeRightNowExpiresAt: z.number().nullable().optional(),
	rightNowRemaining: z.number().default(0),
	revealEffectEnabled: z.boolean().default(true),
	revealEffectStrength: z.enum(["subtle", "pronounced"]).default("subtle"),
	showAlbumSensitiveContentWarning: z.boolean().default(true),
	openAlbumAsBottomSheet: z.boolean().default(false),
	sortDrawerMediaByFrequency: z.boolean().default(true),
	keepScreenOn: z.boolean().default(false),
	autoFocusLocationSearch: z.boolean().default(true),
	defaultExpiringPhotos: z.boolean().default(false),
	defaultAlbumExpirationType: z
		.enum(["INDEFINITE", "ONCE", "TEN_MINUTES", "ONE_HOUR", "ONE_DAY"])
		.default("INDEFINITE"),
});

type Preferences = z.infer<typeof preferencesSchema>;

interface PreferencesContextType extends Preferences {
	setPreferences: (newValues: Partial<Preferences>) => Promise<void>;
	isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(
	undefined,
);

type PreferencesAction =
	| { type: "SET_GEOHASH"; payload: string | null }
	| { type: "SET_LOCATION_NAME"; payload: string | null }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_COLOR_SCHEME"; payload: ColorScheme }
	| { type: "SET_MOBILE_GRID_COLUMNS"; payload: "2" | "3" }
	| { type: "SET_UNITS_PRESET"; payload: UnitsPreset }
	| { type: "SET_BLUR_INCOMING_MEDIA"; payload: boolean }
	| { type: "SET_BLUR_GRID_PROFILE_PICTURES"; payload: boolean }
	| { type: "SET_DEVELOPER_MODE"; payload: boolean }
	| { type: "SET_SHOW_DEBUG_INFO"; payload: boolean }
	| { type: "SET_TEST_REMINDER_DISABLED"; payload: boolean }
	| { type: "SET_AUTO_LOCATION"; payload: boolean }
	| { type: "SET_RIGHT_NOW_TEST_MODE"; payload: boolean }
	| { type: "SET_RIGHT_NOW_REMAINING"; payload: number }
	| { type: "SET_REVEAL_EFFECT_ENABLED"; payload: boolean }
	| { type: "SET_REVEAL_EFFECT_STRENGTH"; payload: RevealStrength }
	| { type: "SET_SHOW_ALBUM_SENSITIVE_CONTENT_WARNING"; payload: boolean }
	| { type: "SET_OPEN_ALBUM_AS_BOTTOM_SHEET"; payload: boolean }
	| { type: "SET_SORT_DRAWER_MEDIA_BY_FREQUENCY"; payload: boolean }
	| { type: "SET_KEEP_SCREEN_ON"; payload: boolean }
	| { type: "SET_AUTO_FOCUS_LOCATION_SEARCH"; payload: boolean }
	| { type: "SET_DEFAULT_EXPIRING_PHOTOS"; payload: boolean }
	| { type: "SET_DEFAULT_ALBUM_EXPIRATION_TYPE"; payload: Preferences["defaultAlbumExpirationType"] }
	| { type: "SET_RIGHT_NOW_STATUS"; payload: { id: number | null; expiresAt: number | null } }
	| { type: "SET_ACCENT"; payload: { color: string; contrast: string } };

function preferencesReducer(
	state: Preferences & { isLoading: boolean },
	action: PreferencesAction,
): Preferences & { isLoading: boolean } {
	switch (action.type) {
		case "SET_GEOHASH":
			return { ...state, geohash: action.payload };
		case "SET_LOCATION_NAME":
			return { ...state, locationName: action.payload };
		case "SET_LOADING":
			return { ...state, isLoading: action.payload };
		case "SET_COLOR_SCHEME":
			return { ...state, colorScheme: action.payload };
		case "SET_MOBILE_GRID_COLUMNS":
			return { ...state, mobileGridColumns: action.payload };
		case "SET_UNITS_PRESET":
			return { ...state, unitsPreset: action.payload };
		case "SET_BLUR_INCOMING_MEDIA":
			return { ...state, blurIncomingMedia: action.payload };
		case "SET_BLUR_GRID_PROFILE_PICTURES":
			return { ...state, blurGridProfilePictures: action.payload };
		case "SET_DEVELOPER_MODE":
			return { ...state, developerMode: action.payload };
		case "SET_SHOW_DEBUG_INFO":
			return { ...state, showDebugInfo: action.payload };
		case "SET_TEST_REMINDER_DISABLED":
			return { ...state, testReminderDisabled: action.payload };
		case "SET_AUTO_LOCATION":
			return { ...state, useAutoLocation: action.payload };
		case "SET_RIGHT_NOW_TEST_MODE":
			return { ...state, rightNowTestMode: action.payload };
		case "SET_RIGHT_NOW_REMAINING":
			return { ...state, rightNowRemaining: action.payload };
		case "SET_REVEAL_EFFECT_ENABLED":
			return { ...state, revealEffectEnabled: action.payload };
		case "SET_REVEAL_EFFECT_STRENGTH":
			return { ...state, revealEffectStrength: action.payload };
		case "SET_SHOW_ALBUM_SENSITIVE_CONTENT_WARNING":
			return { ...state, showAlbumSensitiveContentWarning: action.payload };
		case "SET_OPEN_ALBUM_AS_BOTTOM_SHEET":
			return { ...state, openAlbumAsBottomSheet: action.payload };
		case "SET_SORT_DRAWER_MEDIA_BY_FREQUENCY":
			return { ...state, sortDrawerMediaByFrequency: action.payload };
		case "SET_KEEP_SCREEN_ON":
			return { ...state, keepScreenOn: action.payload };
		case "SET_AUTO_FOCUS_LOCATION_SEARCH":
			return { ...state, autoFocusLocationSearch: action.payload };
		case "SET_DEFAULT_EXPIRING_PHOTOS":
			return { ...state, defaultExpiringPhotos: action.payload };
		case "SET_DEFAULT_ALBUM_EXPIRATION_TYPE":
			return { ...state, defaultAlbumExpirationType: action.payload };
		case "SET_RIGHT_NOW_STATUS":
			return {
				...state,
				activeRightNowId: action.payload.id,
				activeRightNowExpiresAt: action.payload.expiresAt,
			};
		case "SET_ACCENT":
			return {
				...state,
				accentColor: action.payload.color,
				accentContrast: action.payload.contrast,
			};
		default:
			return state;
	}
}

function applyTheme(colorScheme: ColorScheme, accentColor: string, accentContrast: string, revealStrength: RevealStrength) {
	const root = document.documentElement;
	root.setAttribute("data-scheme", colorScheme);
	root.style.setProperty("--accent", accentColor);
	root.style.setProperty("--accent-contrast", accentContrast);

	const strength = revealStrength === "pronounced" ? REVEAL_STRENGTH_PRONOUNCED : REVEAL_STRENGTH_SUBTLE;
	root.style.setProperty("--reveal-translate-y", strength.translateY);
	root.style.setProperty("--reveal-scale", strength.scale);
	root.style.setProperty("--reveal-blur", strength.blur);

	const styles = getComputedStyle(root);
	const backgroundColor = styles.getPropertyValue("--bg").trim();
	const surfaceColor = styles.getPropertyValue("--surface").trim();
	const surface2Color = styles.getPropertyValue("--surface-2").trim();
	const textColor = styles.getPropertyValue("--text").trim();
	const readableAccentColor = getReadableAccentColor(
		accentColor,
		[backgroundColor, surfaceColor, surface2Color],
		textColor,
	);

	root.style.setProperty("--accent-readable", readableAccentColor);
}

export const PREFERENCES_STORAGE_KEY = "app_preferences";

// Per-profile location settings — backed by the active account's chatDb
// (see chatDb.ts's generic settings key/value store), not this shared
// localStorage blob, so switching accounts switches location too.
const LOCATION_SETTINGS_KEY = "locationPreferences";

interface StoredLocationPrefs {
	geohash: string | null;
	locationName: string | null;
	useAutoLocation: boolean;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(preferencesReducer, {
		geohash: null,
		locationName: null,
		colorScheme: "dark",
		accentColor: "#ffcc01",
		accentContrast: "#1a1a1a",
		mobileGridColumns: "3",
		unitsPreset: "world",
		blurIncomingMedia: false,
		blurGridProfilePictures: false,
		developerMode: false,
		showDebugInfo: false,
		testReminderDisabled: false,
		useAutoLocation: false,
		rightNowTestMode: false,
		activeRightNowId: null,
		activeRightNowExpiresAt: null,
		rightNowRemaining: 0,
		revealEffectEnabled: true,
		revealEffectStrength: "subtle",
		showAlbumSensitiveContentWarning: true,
		openAlbumAsBottomSheet: false,
		sortDrawerMediaByFrequency: true,
		keepScreenOn: false,
		autoFocusLocationSearch: true,
		defaultExpiringPhotos: false,
		defaultAlbumExpirationType: "INDEFINITE",
		isLoading: true,
	});

	// Load preferences from localStorage on mount
	useEffect(() => {
		const loadPreferences = async () => {
			try {
				const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
				const isDesktopDevice = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
				const deviceDefaultStrength = isDesktopDevice ? "pronounced" : "subtle";

				if (stored) {
					const decoded = JSON.parse(stored) as Record<string, unknown>;

					// If the strength wasn't explicitly saved yet, use the device-based default
					if (decoded.revealEffectStrength === undefined) {
						decoded.revealEffectStrength = deviceDefaultStrength;
					}

					const parsed = preferencesSchema.parse(decoded);
					// geohash/locationName/useAutoLocation are intentionally not
					// dispatched here — they're per-profile and loaded by the
					// settingsReady-gated effect below instead.
					dispatch({ type: "SET_COLOR_SCHEME", payload: parsed.colorScheme });
					dispatch({ type: "SET_MOBILE_GRID_COLUMNS", payload: parsed.mobileGridColumns });
					dispatch({ type: "SET_UNITS_PRESET", payload: parsed.unitsPreset });
					dispatch({ type: "SET_BLUR_INCOMING_MEDIA", payload: parsed.blurIncomingMedia });
					dispatch({ type: "SET_BLUR_GRID_PROFILE_PICTURES", payload: parsed.blurGridProfilePictures });
					dispatch({ type: "SET_DEVELOPER_MODE", payload: parsed.developerMode });
					dispatch({ type: "SET_SHOW_DEBUG_INFO", payload: parsed.showDebugInfo });
					dispatch({ type: "SET_TEST_REMINDER_DISABLED", payload: parsed.testReminderDisabled });
					dispatch({ type: "SET_RIGHT_NOW_TEST_MODE", payload: parsed.rightNowTestMode });
					dispatch({ type: "SET_RIGHT_NOW_REMAINING", payload: parsed.rightNowRemaining });
					dispatch({ type: "SET_REVEAL_EFFECT_ENABLED", payload: parsed.revealEffectEnabled });
					dispatch({ type: "SET_REVEAL_EFFECT_STRENGTH", payload: parsed.revealEffectStrength });
					dispatch({ type: "SET_SHOW_ALBUM_SENSITIVE_CONTENT_WARNING", payload: parsed.showAlbumSensitiveContentWarning });
					dispatch({ type: "SET_OPEN_ALBUM_AS_BOTTOM_SHEET", payload: parsed.openAlbumAsBottomSheet });
					dispatch({ type: "SET_SORT_DRAWER_MEDIA_BY_FREQUENCY", payload: parsed.sortDrawerMediaByFrequency });
					dispatch({ type: "SET_KEEP_SCREEN_ON", payload: parsed.keepScreenOn });
					dispatch({ type: "SET_AUTO_FOCUS_LOCATION_SEARCH", payload: parsed.autoFocusLocationSearch });
					dispatch({ type: "SET_DEFAULT_EXPIRING_PHOTOS", payload: parsed.defaultExpiringPhotos });
					dispatch({ type: "SET_DEFAULT_ALBUM_EXPIRATION_TYPE", payload: parsed.defaultAlbumExpirationType });
					dispatch({
						type: "SET_RIGHT_NOW_STATUS",
						payload: {
							id: parsed.activeRightNowId ?? null,
							expiresAt: parsed.activeRightNowExpiresAt ?? null,
						},
					});
					dispatch({
						type: "SET_ACCENT",
						payload: { color: parsed.accentColor, contrast: parsed.accentContrast },
					});
					applyTheme(parsed.colorScheme, parsed.accentColor, parsed.accentContrast, parsed.revealEffectStrength);
				} else {
					// No stored preferences at all, apply device defaults immediately
					dispatch({ type: "SET_REVEAL_EFFECT_STRENGTH", payload: deviceDefaultStrength });
					// We also need to apply the theme with these defaults
					applyTheme("dark", "#ffcc01", "#1a1a1a", deviceDefaultStrength);
				}
			} catch (error) {
				appLog.error("Failed to load preferences:", error);
			} finally {
				dispatch({ type: "SET_LOADING", payload: false });
			}
		};

		loadPreferences();
	}, []);

	// Per-profile location — reload whenever the active account's chatDb is
	// ready (settingsReady), so switching accounts also switches location
	// instead of leaking the previous account's geohash/locationName. Kept
	// out of `isLoading` until the first load resolves, otherwise consumers
	// like GridPage's initial-auto-location effect would see the reducer's
	// default useAutoLocation=false and skip auto-location before the real
	// per-profile value has had a chance to arrive.
	const { userId, settingsReady } = useAuth();
	const [isLocationLoaded, setIsLocationLoaded] = useState(false);
	useEffect(() => {
		if (!settingsReady) {
			return;
		}
		let cancelled = false;
		void (async () => {
			const stored = await getSetting<Partial<StoredLocationPrefs>>(LOCATION_SETTINGS_KEY);
			if (cancelled) {
				return;
			}
			dispatch({ type: "SET_GEOHASH", payload: stored?.geohash ?? null });
			dispatch({ type: "SET_LOCATION_NAME", payload: stored?.locationName ?? null });
			dispatch({ type: "SET_AUTO_LOCATION", payload: stored?.useAutoLocation ?? false });
			setIsLocationLoaded(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [userId, settingsReady]);

	const stateRef = useRef(state);
	stateRef.current = state;

	const setPreferences = useCallback(
		async (newValues: Partial<Preferences>) => {
			const currentState = stateRef.current;
			// Get current state to ensure we don't lose values not provided in newValues
			const preferences: Preferences = {
				geohash: currentState.geohash,
				locationName: currentState.locationName,
				colorScheme: currentState.colorScheme,
				accentColor: currentState.accentColor,
				accentContrast: currentState.accentContrast,
				mobileGridColumns: currentState.mobileGridColumns,
				unitsPreset: currentState.unitsPreset,
				blurIncomingMedia: currentState.blurIncomingMedia,
				blurGridProfilePictures: currentState.blurGridProfilePictures,
				developerMode: currentState.developerMode,
				showDebugInfo: currentState.showDebugInfo,
				testReminderDisabled: currentState.testReminderDisabled,
				useAutoLocation: currentState.useAutoLocation,
				rightNowTestMode: currentState.rightNowTestMode,
				rightNowRemaining: currentState.rightNowRemaining,
				revealEffectEnabled: currentState.revealEffectEnabled,
				revealEffectStrength: currentState.revealEffectStrength,
				showAlbumSensitiveContentWarning: currentState.showAlbumSensitiveContentWarning,
				openAlbumAsBottomSheet: currentState.openAlbumAsBottomSheet,
				sortDrawerMediaByFrequency: currentState.sortDrawerMediaByFrequency,
				keepScreenOn: currentState.keepScreenOn,
				autoFocusLocationSearch: currentState.autoFocusLocationSearch,
				defaultExpiringPhotos: currentState.defaultExpiringPhotos,
				defaultAlbumExpirationType: currentState.defaultAlbumExpirationType,
				activeRightNowId: currentState.activeRightNowId ?? null,
				activeRightNowExpiresAt: currentState.activeRightNowExpiresAt ?? null,
				...newValues,
			};

			// Validate before saving
			try {
				preferencesSchema.parse(preferences);
			} catch (e) {
				appLog.error("Validation failed in setPreferences:", e);
				throw e;
			}

			// Update state via dispatches
			if (newValues.geohash !== undefined) {
				dispatch({ type: "SET_GEOHASH", payload: newValues.geohash });
			}
			if (newValues.locationName !== undefined) {
				dispatch({ type: "SET_LOCATION_NAME", payload: newValues.locationName });
			}
			if (newValues.colorScheme !== undefined) {
				dispatch({ type: "SET_COLOR_SCHEME", payload: newValues.colorScheme });
			}
			if (newValues.mobileGridColumns !== undefined) {
				dispatch({ type: "SET_MOBILE_GRID_COLUMNS", payload: newValues.mobileGridColumns });
			}
			if (newValues.unitsPreset !== undefined) {
				dispatch({ type: "SET_UNITS_PRESET", payload: newValues.unitsPreset });
			}
			if (newValues.blurIncomingMedia !== undefined) {
				dispatch({ type: "SET_BLUR_INCOMING_MEDIA", payload: newValues.blurIncomingMedia });
			}
			if (newValues.blurGridProfilePictures !== undefined) {
				dispatch({ type: "SET_BLUR_GRID_PROFILE_PICTURES", payload: newValues.blurGridProfilePictures });
			}
			if (newValues.developerMode !== undefined) {
				dispatch({ type: "SET_DEVELOPER_MODE", payload: newValues.developerMode });
			}
			if (newValues.showDebugInfo !== undefined) {
				dispatch({ type: "SET_SHOW_DEBUG_INFO", payload: newValues.showDebugInfo });
			}
			if (newValues.testReminderDisabled !== undefined) {
				dispatch({ type: "SET_TEST_REMINDER_DISABLED", payload: newValues.testReminderDisabled });
			}
			if (newValues.useAutoLocation !== undefined) {
				dispatch({ type: "SET_AUTO_LOCATION", payload: newValues.useAutoLocation });
			}
			if (newValues.rightNowTestMode !== undefined) {
				dispatch({ type: "SET_RIGHT_NOW_TEST_MODE", payload: newValues.rightNowTestMode });
			}
			if (newValues.rightNowRemaining !== undefined) {
				dispatch({ type: "SET_RIGHT_NOW_REMAINING", payload: newValues.rightNowRemaining });
			}
			if (newValues.revealEffectEnabled !== undefined) {
				dispatch({ type: "SET_REVEAL_EFFECT_ENABLED", payload: newValues.revealEffectEnabled });
			}
			if (newValues.revealEffectStrength !== undefined) {
				dispatch({ type: "SET_REVEAL_EFFECT_STRENGTH", payload: newValues.revealEffectStrength });
			}
			if (newValues.showAlbumSensitiveContentWarning !== undefined) {
				dispatch({ type: "SET_SHOW_ALBUM_SENSITIVE_CONTENT_WARNING", payload: newValues.showAlbumSensitiveContentWarning });
			}
			if (newValues.openAlbumAsBottomSheet !== undefined) {
				dispatch({ type: "SET_OPEN_ALBUM_AS_BOTTOM_SHEET", payload: newValues.openAlbumAsBottomSheet });
			}
			if (newValues.sortDrawerMediaByFrequency !== undefined) {
				dispatch({ type: "SET_SORT_DRAWER_MEDIA_BY_FREQUENCY", payload: newValues.sortDrawerMediaByFrequency });
			}
			if (newValues.keepScreenOn !== undefined) {
				dispatch({ type: "SET_KEEP_SCREEN_ON", payload: newValues.keepScreenOn });
			}
			if (newValues.autoFocusLocationSearch !== undefined) {
				dispatch({ type: "SET_AUTO_FOCUS_LOCATION_SEARCH", payload: newValues.autoFocusLocationSearch });
			}
			if (newValues.defaultExpiringPhotos !== undefined) {
				dispatch({ type: "SET_DEFAULT_EXPIRING_PHOTOS", payload: newValues.defaultExpiringPhotos });
			}
			if (newValues.defaultAlbumExpirationType !== undefined) {
				dispatch({ type: "SET_DEFAULT_ALBUM_EXPIRATION_TYPE", payload: newValues.defaultAlbumExpirationType });
			}
			if (
				newValues.activeRightNowId !== undefined ||
				newValues.activeRightNowExpiresAt !== undefined
			) {
				dispatch({
					type: "SET_RIGHT_NOW_STATUS",
					payload: {
						id:
							newValues.activeRightNowId !== undefined
								? newValues.activeRightNowId
								: currentState.activeRightNowId ?? null,
						expiresAt:
							newValues.activeRightNowExpiresAt !== undefined
								? newValues.activeRightNowExpiresAt
								: currentState.activeRightNowExpiresAt ?? null,
					},
				});
			}
			if (newValues.accentColor !== undefined || newValues.accentContrast !== undefined) {
				dispatch({
					type: "SET_ACCENT",
					payload: {
						color: newValues.accentColor ?? currentState.accentColor,
						contrast: newValues.accentContrast ?? currentState.accentContrast,
					},
				});
			}

			// Apply theme immediately
			applyTheme(
				preferences.colorScheme,
				preferences.accentColor,
				preferences.accentContrast,
				preferences.revealEffectStrength,
			);

			// geohash/locationName/useAutoLocation are per-profile: persisted to
			// the active account's chatDb instead of this shared blob.
			if (
				newValues.geohash !== undefined ||
				newValues.locationName !== undefined ||
				newValues.useAutoLocation !== undefined
			) {
				await setSetting(LOCATION_SETTINGS_KEY, {
					geohash: preferences.geohash,
					locationName: preferences.locationName ?? null,
					useAutoLocation: preferences.useAutoLocation,
				} satisfies StoredLocationPrefs);
			}

			// Persist the rest to localStorage (geohash/locationName/useAutoLocation excluded, see above)
			localStorage.setItem(
				PREFERENCES_STORAGE_KEY,
				JSON.stringify({
					colorScheme: preferences.colorScheme,
					accentColor: preferences.accentColor,
					accentContrast: preferences.accentContrast,
					mobileGridColumns: preferences.mobileGridColumns,
					unitsPreset: preferences.unitsPreset,
					blurIncomingMedia: preferences.blurIncomingMedia,
					blurGridProfilePictures: preferences.blurGridProfilePictures,
					developerMode: preferences.developerMode,
					showDebugInfo: preferences.showDebugInfo,
					testReminderDisabled: preferences.testReminderDisabled,
					rightNowTestMode: preferences.rightNowTestMode,
					rightNowRemaining: preferences.rightNowRemaining,
					revealEffectEnabled: preferences.revealEffectEnabled,
					revealEffectStrength: preferences.revealEffectStrength,
					showAlbumSensitiveContentWarning: preferences.showAlbumSensitiveContentWarning,
					openAlbumAsBottomSheet: preferences.openAlbumAsBottomSheet,
					sortDrawerMediaByFrequency: preferences.sortDrawerMediaByFrequency,
					keepScreenOn: preferences.keepScreenOn,
					autoFocusLocationSearch: preferences.autoFocusLocationSearch,
					defaultExpiringPhotos: preferences.defaultExpiringPhotos,
					defaultAlbumExpirationType: preferences.defaultAlbumExpirationType,
					activeRightNowId: preferences.activeRightNowId,
					activeRightNowExpiresAt: preferences.activeRightNowExpiresAt,
				}),
			);
		},
		[dispatch],
	);

	const value: PreferencesContextType = {
		geohash: state.geohash,
		locationName: state.locationName,
		colorScheme: state.colorScheme,
		accentColor: state.accentColor,
		accentContrast: state.accentContrast,
		mobileGridColumns: state.mobileGridColumns,
		unitsPreset: state.unitsPreset,
		blurIncomingMedia: state.blurIncomingMedia,
		blurGridProfilePictures: state.blurGridProfilePictures,
		developerMode: state.developerMode,
		showDebugInfo: state.showDebugInfo,
		testReminderDisabled: state.testReminderDisabled,
		useAutoLocation: state.useAutoLocation,
		rightNowTestMode: state.rightNowTestMode,
		activeRightNowId: state.activeRightNowId,
		activeRightNowExpiresAt: state.activeRightNowExpiresAt,
		rightNowRemaining: state.rightNowRemaining,
		revealEffectEnabled: state.revealEffectEnabled,
		revealEffectStrength: state.revealEffectStrength,
		showAlbumSensitiveContentWarning: state.showAlbumSensitiveContentWarning,
		openAlbumAsBottomSheet: state.openAlbumAsBottomSheet,
		sortDrawerMediaByFrequency: state.sortDrawerMediaByFrequency,
		keepScreenOn: state.keepScreenOn,
		autoFocusLocationSearch: state.autoFocusLocationSearch,
		defaultExpiringPhotos: state.defaultExpiringPhotos,
		defaultAlbumExpirationType: state.defaultAlbumExpirationType,
		setPreferences,
		isLoading: state.isLoading || !isLocationLoaded,
	};

	return (
		<PreferencesContext.Provider value={value}>
			{children}
		</PreferencesContext.Provider>
	);
}

export function usePreferences() {
	const context = useContext(PreferencesContext);
	if (!context) {
		throw new Error("usePreferences must be used within PreferencesProvider");
	}
	return context;
}
