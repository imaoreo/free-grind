import {
	createContext,
	useContext,
	useReducer,
	useEffect,
	ReactNode,
	useCallback,
	useRef,
} from "react";
import z from "zod";
import { appLog } from "../utils/logger";
import { geohashSchema } from "../utils/geohash";
import { UNIT_PRESETS, type UnitsPreset } from "../utils/units";

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

const preferencesSchema = z.object({
	geohash: geohashSchema.nullable(),
	locationName: z.string().nullable().optional(),
	colorScheme: z.enum(["system", "light", "dark"]).default("system"),
	accentColor: z.string().default("#ffcc01"),
	accentContrast: z.string().default("#1a1a1a"),
	mobileGridColumns: z.enum(["2", "3"]).default("3"),
	unitsPreset: z.enum(UNIT_PRESETS).default("world"),
	blurIncomingMedia: z.boolean().default(false),
	developerMode: z.boolean().default(false),
	showDebugInfo: z.boolean().default(false),
	useAutoLocation: z.boolean().default(false),
	rightNowTestMode: z.boolean().default(false),
	activeRightNowId: z.number().nullable().optional(),
	activeRightNowExpiresAt: z.number().nullable().optional(),
	rightNowRemaining: z.number().default(0),
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
	| { type: "SET_DEVELOPER_MODE"; payload: boolean }
	| { type: "SET_SHOW_DEBUG_INFO"; payload: boolean }
	| { type: "SET_AUTO_LOCATION"; payload: boolean }
	| { type: "SET_RIGHT_NOW_TEST_MODE"; payload: boolean }
	| { type: "SET_RIGHT_NOW_REMAINING"; payload: number }
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
		case "SET_DEVELOPER_MODE":
			return { ...state, developerMode: action.payload };
		case "SET_SHOW_DEBUG_INFO":
			return { ...state, showDebugInfo: action.payload };
		case "SET_AUTO_LOCATION":
			return { ...state, useAutoLocation: action.payload };
		case "SET_RIGHT_NOW_TEST_MODE":
			return { ...state, rightNowTestMode: action.payload };
		case "SET_RIGHT_NOW_REMAINING":
			return { ...state, rightNowRemaining: action.payload };
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

function applyTheme(colorScheme: ColorScheme, accentColor: string, accentContrast: string) {
	const root = document.documentElement;
	root.setAttribute("data-scheme", colorScheme);
	root.style.setProperty("--accent", accentColor);
	root.style.setProperty("--accent-contrast", accentContrast);

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

const STORAGE_KEY = "app_preferences";

export function PreferencesProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(preferencesReducer, {
		geohash: null,
		locationName: null,
		colorScheme: "system",
		accentColor: "#ffcc01",
		accentContrast: "#1a1a1a",
		mobileGridColumns: "3",
		unitsPreset: "world",
		blurIncomingMedia: false,
		developerMode: false,
		showDebugInfo: false,
		useAutoLocation: false,
		rightNowTestMode: false,
		activeRightNowId: null,
		activeRightNowExpiresAt: null,
		rightNowRemaining: 0,
		isLoading: true,
	});

	// Load preferences from localStorage on mount
	useEffect(() => {
		const loadPreferences = async () => {
			try {
				const stored = localStorage.getItem(STORAGE_KEY);
				if (stored) {
					const decoded = JSON.parse(stored);
					const parsed = preferencesSchema.parse(decoded);
					dispatch({ type: "SET_GEOHASH", payload: parsed.geohash });
					dispatch({ type: "SET_LOCATION_NAME", payload: parsed.locationName ?? null });
					dispatch({ type: "SET_COLOR_SCHEME", payload: parsed.colorScheme });
					dispatch({ type: "SET_MOBILE_GRID_COLUMNS", payload: parsed.mobileGridColumns });
					dispatch({ type: "SET_UNITS_PRESET", payload: parsed.unitsPreset });
					dispatch({ type: "SET_BLUR_INCOMING_MEDIA", payload: parsed.blurIncomingMedia });
					dispatch({ type: "SET_DEVELOPER_MODE", payload: parsed.developerMode });
					dispatch({ type: "SET_SHOW_DEBUG_INFO", payload: parsed.showDebugInfo });
					dispatch({ type: "SET_AUTO_LOCATION", payload: parsed.useAutoLocation });
					dispatch({ type: "SET_RIGHT_NOW_TEST_MODE", payload: parsed.rightNowTestMode });
					dispatch({ type: "SET_RIGHT_NOW_REMAINING", payload: parsed.rightNowRemaining });
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
					applyTheme(parsed.colorScheme, parsed.accentColor, parsed.accentContrast);
				}
			} catch (error) {
				appLog.error("Failed to load preferences:", error);
			} finally {
				dispatch({ type: "SET_LOADING", payload: false });
			}
		};

		loadPreferences();
	}, []);

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
				developerMode: currentState.developerMode,
				showDebugInfo: currentState.showDebugInfo,
				useAutoLocation: currentState.useAutoLocation,
				rightNowTestMode: currentState.rightNowTestMode,
				rightNowRemaining: currentState.rightNowRemaining,
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
			if (newValues.developerMode !== undefined) {
				dispatch({ type: "SET_DEVELOPER_MODE", payload: newValues.developerMode });
			}
			if (newValues.showDebugInfo !== undefined) {
				dispatch({ type: "SET_SHOW_DEBUG_INFO", payload: newValues.showDebugInfo });
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
			);

			// Persist to localStorage
			localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
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
		developerMode: state.developerMode,
		showDebugInfo: state.showDebugInfo,
		useAutoLocation: state.useAutoLocation,
		rightNowTestMode: state.rightNowTestMode,
		activeRightNowId: state.activeRightNowId,
		activeRightNowExpiresAt: state.activeRightNowExpiresAt,
		rightNowRemaining: state.rightNowRemaining,
		setPreferences,
		isLoading: state.isLoading,
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
