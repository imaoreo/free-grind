import { useEffect, useState } from "react";
import { DESKTOP_BREAKPOINT_PX } from "../config/ui-constants";

/**
 * Hook to detect if the window viewport is at or above the desktop breakpoint.
 */
export function useDesktopBreakpoint() {
	const queryStr = `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`;
	const [isDesktop, setIsDesktop] = useState(() =>
		typeof window !== "undefined"
			? window.matchMedia(queryStr).matches
			: false,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const query = window.matchMedia(queryStr);
		const update = () => setIsDesktop(query.matches);

		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, [queryStr]);

	return isDesktop;
}
