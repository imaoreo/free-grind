import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const HIGHLIGHT_DURATION_MS = 1600;

/**
 * Reads the URL hash left by a settings-search result link, scrolls the
 * matching row into view, and returns its id for the duration of the jump
 * highlight animation (see `.animate-settings-highlight` in index.css).
 */
export function useSettingsHighlight(): string | null {
	const { hash } = useLocation();
	const [highlightId, setHighlightId] = useState<string | null>(null);

	useEffect(() => {
		const id = hash.slice(1);
		if (!id) return;

		setHighlightId(id);
		const el = document.getElementById(id);
		el?.scrollIntoView({ behavior: "smooth", block: "center" });

		const timeout = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_DURATION_MS);
		return () => window.clearTimeout(timeout);
	}, [hash]);

	return highlightId;
}
