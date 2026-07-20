import type { Encounter } from "./encounters";

const ONE_HOUR_MS = 60 * 60 * 1000;

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function toIcsUtcTimestamp(ms: number): string {
	const d = new Date(ms);
	return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\n/g, "\\n");
}

// RFC 5545 requires content lines to be folded at 75 octets; this folds by
// UTF-16 code unit as a close-enough approximation (exact octet counting
// would need per-character UTF-8 byte-length math for no real benefit here).
function foldLine(line: string): string {
	if (line.length <= 75) return line;
	let result = line.slice(0, 75);
	let rest = line.slice(75);
	while (rest.length > 0) {
		result += `\r\n ${rest.slice(0, 74)}`;
		rest = rest.slice(74);
	}
	return result;
}

export function encountersToIcs(encounters: Encounter[]): string {
	const dtstamp = toIcsUtcTimestamp(Date.now());
	const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Free Grind//Encounters Export//EN", "CALSCALE:GREGORIAN"];

	for (const encounter of encounters) {
		const descriptionParts: string[] = [];
		if (encounter.tags.length > 0) descriptionParts.push(`Protection: ${encounter.tags.join(", ")}`);
		if (encounter.note) descriptionParts.push(encounter.note);

		lines.push(
			"BEGIN:VEVENT",
			`UID:encounter-${encounter.id}@freegrind.app`,
			`DTSTAMP:${dtstamp}`,
			`DTSTART:${toIcsUtcTimestamp(encounter.occurredAt)}`,
			`DTEND:${toIcsUtcTimestamp(encounter.occurredAt + ONE_HOUR_MS)}`,
			`SUMMARY:${escapeIcsText(encounter.displayName || "Encounter")}`,
		);
		if (descriptionParts.length > 0) {
			lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`);
		}
		if (encounter.tags.length > 0) {
			lines.push(`CATEGORIES:${encounter.tags.map(escapeIcsText).join(",")}`);
		}
		lines.push("END:VEVENT");
	}

	lines.push("END:VCALENDAR");
	return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
