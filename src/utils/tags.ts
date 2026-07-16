/**
 * Tags are selected from the managed catalog, which pairs a stable server
 * `key` with the localized `text` shown in the UI. State is stored as the
 * `key` (what the server's tag filter / profile update expect), and this
 * map resolves a key back to its display text wherever a chip needs to
 * render one. Falls back to the raw value at the call site when a key has
 * no catalog match (e.g. a free-typed browse-filter tag, or a legacy tag
 * saved before the catalog carried it).
 */
export function buildTagLabelMap(allTags: { key: string; text: string }[]): Map<string, string> {
	return new Map(allTags.map((tag) => [tag.key, tag.text]));
}
