import { useEffect, useState } from "react";
import { usePreferences } from "../contexts/PreferencesContext";

/**
 * Resolves the app's "system" color scheme preference down to an actual
 * "light" | "dark" value, tracking OS-level theme changes live.
 */
export function useEffectiveColorScheme(): "light" | "dark" {
	const { colorScheme } = usePreferences();

	const [prefersDark, setPrefersDark] = useState(() =>
		typeof window !== "undefined"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
			: false,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const update = () => setPrefersDark(query.matches);

		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	if (colorScheme === "light") return "light";
	if (colorScheme === "dark") return "dark";
	return prefersDark ? "dark" : "light";
}
