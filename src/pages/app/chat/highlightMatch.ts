export function highlightMatch(source: string, query: string) {
	const needle = query.trim();
	if (!needle) {
		return [{ text: source, match: false }];
	}

	const lowerSource = source.toLowerCase();
	const lowerNeedle = needle.toLowerCase();
	const parts: Array<{ text: string; match: boolean }> = [];
	let cursor = 0;

	while (cursor < source.length) {
		const found = lowerSource.indexOf(lowerNeedle, cursor);
		if (found < 0) {
			parts.push({ text: source.slice(cursor), match: false });
			break;
		}

		if (found > cursor) {
			parts.push({ text: source.slice(cursor, found), match: false });
		}

		parts.push({ text: source.slice(found, found + needle.length), match: true });
		cursor = found + needle.length;
	}

	return parts.length > 0 ? parts : [{ text: source, match: false }];
}
