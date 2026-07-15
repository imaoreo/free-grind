import { useCallback, useEffect, useState } from "react";
import { getSetting, setSetting } from "../../../services/chatDb";
import type { PrepScheme } from "../../../services/prepTracking";

const SETTING_KEY = "sexualHealthPrepMode";

export function usePrepScheme(): [PrepScheme, (scheme: PrepScheme) => void, boolean] {
	const [scheme, setSchemeState] = useState<PrepScheme>("daily");
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const stored = await getSetting<{ scheme: PrepScheme }>(SETTING_KEY);
			if (!cancelled && stored?.scheme) {
				setSchemeState(stored.scheme);
			}
			if (!cancelled) {
				setLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const updateScheme = useCallback((next: PrepScheme) => {
		setSchemeState(next);
		void setSetting(SETTING_KEY, { scheme: next });
	}, []);

	return [scheme, updateScheme, loaded];
}
