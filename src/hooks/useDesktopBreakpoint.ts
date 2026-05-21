import { useEffect, useState } from "react";

/**
 * Hook to detect if the current viewport is desktop-sized (>= 1024px).
 * Uses window.matchMedia for performance and reactivity.
 */
export function useDesktopBreakpoint() {
	const [isDesktop, setIsDesktop] = useState(() =>
		typeof window !== "undefined"
			? window.matchMedia("(min-width: 1024px)").matches
			: false,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const query = window.matchMedia("(min-width: 1024px)");
		const update = () => setIsDesktop(query.matches);

		// Initial check
		update();

		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	return isDesktop;
}
