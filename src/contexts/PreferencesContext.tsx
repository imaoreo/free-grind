import {
	createContext,
	useContext,
	useReducer,
	useEffect,
	ReactNode,
	useCallback,
} from "react";
import z from "zod";
import { geohashSchema } from "../utils/geohash";

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
	colorScheme: z.enum(["system", "light", "dark"]).default("system"),
	accentColor: z.string().default("#ffcc01"),
	accentContrast: z.string().default("#1a1a1a"),
	mobileGridColumns: z.enum(["2", "3"]).default("3"),
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
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_COLOR_SCHEME"; payload: ColorScheme }
	| { type: "SET_MOBILE_GRID_COLUMNS"; payload: "2" | "3" }
	| { type: "SET_ACCENT"; payload: { color: string; contrast: string } };

function preferencesReducer(
	state: Preferences & { isLoading: boolean },
	action: PreferencesAction,
): Preferences & { isLoading: boolean } {
	switch (action.type) {
		case "SET_GEOHASH":
			return { ...state, geohash: action.payload };
		case "SET_LOADING":
			return { ...state, isLoading: action.payload };
		case "SET_COLOR_SCHEME":
			return { ...state, colorScheme: action.payload };
		case "SET_MOBILE_GRID_COLUMNS":
			return { ...state, mobileGridColumns: action.payload };
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
		colorScheme: "system",
		accentColor: "#ffcc01",
		accentContrast: "#1a1a1a",
		mobileGridColumns: "3",
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
					dispatch({ type: "SET_COLOR_SCHEME", payload: parsed.colorScheme });
					dispatch({ type: "SET_MOBILE_GRID_COLUMNS", payload: parsed.mobileGridColumns });
					dispatch({
						type: "SET_ACCENT",
						payload: { color: parsed.accentColor, contrast: parsed.accentContrast },
					});
					applyTheme(parsed.colorScheme, parsed.accentColor, parsed.accentContrast);
				}
			} catch (error) {
				console.error("Failed to load preferences:", error);
			} finally {
				dispatch({ type: "SET_LOADING", payload: false });
			}
		};

		loadPreferences();
	}, []);

	const setPreferences = useCallback(
		async (newValues: Partial<Preferences>) => {
			const oldValues: Preferences = {
				geohash: state.geohash,
				colorScheme: state.colorScheme,
				accentColor: state.accentColor,
				accentContrast: state.accentContrast,
				mobileGridColumns: state.mobileGridColumns,
			};
			const preferences: Preferences = {
				...oldValues,
				...newValues,
			};

			// Validate before saving
			preferencesSchema.parse(preferences);

			// Update state
			if (newValues.geohash !== undefined) {
				dispatch({ type: "SET_GEOHASH", payload: newValues.geohash });
			}
			if (newValues.colorScheme !== undefined) {
				dispatch({ type: "SET_COLOR_SCHEME", payload: newValues.colorScheme });
			}
			if (newValues.mobileGridColumns !== undefined) {
				dispatch({ type: "SET_MOBILE_GRID_COLUMNS", payload: newValues.mobileGridColumns });
			}
			if (newValues.accentColor !== undefined || newValues.accentContrast !== undefined) {
				dispatch({
					type: "SET_ACCENT",
					payload: {
						color: newValues.accentColor ?? state.accentColor,
						contrast: newValues.accentContrast ?? state.accentContrast,
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
		[
			state.geohash,
			state.colorScheme,
			state.accentColor,
			state.accentContrast,
			state.mobileGridColumns,
		],
	);

	const value: PreferencesContextType = {
		geohash: state.geohash,
		colorScheme: state.colorScheme,
		accentColor: state.accentColor,
		accentContrast: state.accentContrast,
		mobileGridColumns: state.mobileGridColumns,
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
