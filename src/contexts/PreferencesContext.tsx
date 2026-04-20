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

const preferencesSchema = z.object({
	geohash: geohashSchema.nullable(),
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
	| { type: "SET_LOADING"; payload: boolean };

function preferencesReducer(
	state: Preferences & { isLoading: boolean },
	action: PreferencesAction,
): Preferences & { isLoading: boolean } {
	switch (action.type) {
		case "SET_GEOHASH":
			return { ...state, geohash: action.payload };
		case "SET_LOADING":
			return { ...state, isLoading: action.payload };
		default:
			return state;
	}
}

const STORAGE_KEY = "app_preferences";

export function PreferencesProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(preferencesReducer, {
		geohash: null,
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
			const oldValues = {
				geohash: state.geohash,
			};
			const preferences = {
				...oldValues,
				...newValues,
			};

			// Validate before saving
			preferencesSchema.parse(preferences);

			// Update state
			if (newValues.geohash !== undefined) {
				dispatch({ type: "SET_GEOHASH", payload: newValues.geohash });
			}

			// Persist to localStorage
			localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
		},
		[state.geohash],
	);

	const value: PreferencesContextType = {
		geohash: state.geohash,
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
