import type { ManagedTag } from "../types/api-functions";

/**
 * Tag state throughout the UI (search matching, selected chips, drafts) is
 * kept as display text, since that's what needs to render. The server's
 * write endpoints (browse tag filter, profile tags) expect the stable
 * catalog `key` instead, so this maps text -> key right at the network
 * boundary. Falls back to the original text when there's no catalog match
 * (e.g. a free-typed browse-filter tag that isn't a real managed tag) since
 * there's no key to send instead.
 */
export function tagTextsToKeys(allTags: ManagedTag[], texts: string[]): string[] {
	if (texts.length === 0) return texts;
	const keyByText = new Map(allTags.map((tag) => [tag.text.toLowerCase(), tag.key]));
	return texts.map((text) => keyByText.get(text.trim().toLowerCase()) ?? text);
}
