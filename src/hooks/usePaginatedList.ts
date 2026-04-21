import { useCallback, useRef } from "react";

export function usePaginatedList() {
	const anchorRef = useRef<HTMLElement | null>(null);

	const captureAnchor = useCallback((element: HTMLElement | null) => {
		anchorRef.current = element;
	}, []);

	const restoreAnchor = useCallback(() => {
		anchorRef.current?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
	}, []);

	return {
		captureAnchor,
		restoreAnchor,
	};
}
