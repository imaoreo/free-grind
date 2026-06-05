import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() =>
		typeof window !== "undefined" ? window.matchMedia(query).matches : false,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const media = window.matchMedia(query);
		const update = () => setMatches(media.matches);

		update();

		if (media.addEventListener) {
			media.addEventListener("change", update);
			return () => media.removeEventListener("change", update);
		} else {
			// fallback for older Safari/WebViews
			media.addListener(update);
			return () => media.removeListener(update);
		}
	}, [query]);

	return matches;
}
