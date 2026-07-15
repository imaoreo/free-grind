/**
 * Pure PrEP protection-window heuristics. This is a self-tracking aid, not
 * medical guidance — thresholds below are simplified approximations of
 * common daily and on-demand (2-1-1) dosing guidance, tuned for a rough
 * "am I likely covered right now" signal rather than clinical accuracy.
 */

export type PrepScheme = "daily" | "on_demand";
export type PrepDoseRole = "daily" | "loading" | "plus24" | "plus48";

export interface PrepDoseEvent {
	takenAt: number;
	scheme: PrepScheme;
	doseRole: PrepDoseRole;
}

export type PrepProtectionStatus =
	| { state: "protected"; sinceMs: number }
	| { state: "building"; detail: "awaiting_plus24" | "awaiting_plus48" | "awaiting_daily_streak" }
	| { state: "unprotected" }
	| { state: "unknown" };

const HOUR_MS = 60 * 60 * 1000;

// Daily-mode thresholds.
const DAILY_GRACE_MS = 48 * HOUR_MS;
const DAILY_MIN_CADENCE_MS = 20 * HOUR_MS;
const DAILY_MAX_CADENCE_MS = 36 * HOUR_MS;
// A gap in this range means exactly one day was skipped (roughly a 2-day-old
// dose instead of consecutive daily ones) — forgiven once per streak so a
// single missed day doesn't reset the whole count back to the beginning.
const DAILY_MISSED_DAY_MAX_MS = 2 * DAILY_MAX_CADENCE_MS;
// CDC guidance: daily PrEP reaches full protection after about 7 days of
// consistent dosing for receptive anal sex (the fastest-onset case) — used
// here as the "protected" threshold even though onset for insertive/vaginal
// sex is slower (~20 days), since this is a rough self-tracking signal, not
// a per-act-type clinical calculation.
const DAILY_DOSES_FOR_PROTECTION = 7;

// On-demand (2-1-1) thresholds.
const LOADING_ONSET_MS = 2 * HOUR_MS;
const PLUS24_DUE_MS = 24 * HOUR_MS;
const PLUS48_DUE_MS = 48 * HOUR_MS;
const FOLLOWUP_GRACE_MS = 6 * HOUR_MS;
const SEQUENCE_ORPHAN_WINDOW_MS = 72 * HOUR_MS;
const COURSE_COMPLETE_GRACE_MS = 24 * HOUR_MS;

function computeDailyStatus(events: PrepDoseEvent[], now: number): PrepProtectionStatus {
	if (events.length === 0) {
		return { state: "unknown" };
	}
	const sorted = [...events].sort((a, b) => a.takenAt - b.takenAt);
	const last = sorted[sorted.length - 1];
	if (now - last.takenAt > DAILY_GRACE_MS) {
		return { state: "unprotected" };
	}

	// Walk backward from the most recent dose, counting a consecutive run of
	// doses taken at a consistent ~daily cadence. One missed day along the
	// way is forgiven (doesn't break the streak, but doesn't add to it
	// either); a second missed day — or any larger gap — does break it.
	let streak = 1;
	let missedDayUsed = false;
	for (let i = sorted.length - 1; i > 0; i--) {
		const gapMs = sorted[i].takenAt - sorted[i - 1].takenAt;
		if (gapMs >= DAILY_MIN_CADENCE_MS && gapMs <= DAILY_MAX_CADENCE_MS) {
			streak += 1;
			continue;
		}
		if (!missedDayUsed && gapMs > DAILY_MAX_CADENCE_MS && gapMs <= DAILY_MISSED_DAY_MAX_MS) {
			missedDayUsed = true;
			continue;
		}
		break;
	}

	if (streak >= DAILY_DOSES_FOR_PROTECTION) {
		const sinceIndex = sorted.length - DAILY_DOSES_FOR_PROTECTION;
		return { state: "protected", sinceMs: sorted[sinceIndex].takenAt };
	}

	return { state: "building", detail: "awaiting_daily_streak" };
}

interface OnDemandSequence {
	loading: PrepDoseEvent;
	plus24?: PrepDoseEvent;
	plus48?: PrepDoseEvent;
}

function buildOnDemandSequences(events: PrepDoseEvent[]): OnDemandSequence[] {
	const sorted = [...events].sort((a, b) => a.takenAt - b.takenAt);
	const sequences: OnDemandSequence[] = [];
	for (const event of sorted) {
		if (event.doseRole === "loading") {
			sequences.push({ loading: event });
			continue;
		}
		const current = sequences[sequences.length - 1];
		if (!current || event.takenAt - current.loading.takenAt > SEQUENCE_ORPHAN_WINDOW_MS) {
			// A plus24/plus48 dose with no recent loading dose is orphaned —
			// still shown in history elsewhere, just not used for status.
			continue;
		}
		if (event.doseRole === "plus24") {
			current.plus24 = event;
		} else if (event.doseRole === "plus48") {
			current.plus48 = event;
		}
	}
	return sequences;
}

function computeOnDemandStatus(events: PrepDoseEvent[], now: number): PrepProtectionStatus {
	const sequences = buildOnDemandSequences(events);
	if (sequences.length === 0) {
		return { state: "unknown" };
	}
	const seq = sequences[sequences.length - 1];
	const onsetAt = seq.loading.takenAt + LOADING_ONSET_MS;
	if (now < onsetAt) {
		return { state: "building", detail: "awaiting_plus24" };
	}

	if (seq.plus48) {
		// Course complete. Protection doesn't vanish the instant the +48h pill
		// is taken, so keep reading "protected" for a buffer afterwards; once
		// that passes this sequence is simply done — that's not a lapse, so
		// don't report it as "unprotected", just reset to a clean slate for
		// the next encounter.
		return now <= seq.plus48.takenAt + COURSE_COMPLETE_GRACE_MS
			? { state: "protected", sinceMs: onsetAt }
			: { state: "unknown" };
	}

	const missedPlus24 = !seq.plus24 && now >= seq.loading.takenAt + PLUS24_DUE_MS + FOLLOWUP_GRACE_MS;
	const missedPlus48 = now >= seq.loading.takenAt + PLUS48_DUE_MS + FOLLOWUP_GRACE_MS;
	if (missedPlus24 || missedPlus48) {
		// Badly overdue with no follow-up logged at all — the course lapsed
		// rather than just running a little behind schedule.
		if (now > seq.loading.takenAt + SEQUENCE_ORPHAN_WINDOW_MS) {
			return { state: "unprotected" };
		}
		return { state: "building", detail: missedPlus24 ? "awaiting_plus24" : "awaiting_plus48" };
	}

	return { state: "protected", sinceMs: onsetAt };
}

export function computeProtectionStatus(
	events: PrepDoseEvent[],
	scheme: PrepScheme,
	now: number = Date.now(),
): PrepProtectionStatus {
	const relevant = events.filter((event) => event.scheme === scheme);
	return scheme === "daily" ? computeDailyStatus(relevant, now) : computeOnDemandStatus(relevant, now);
}

export type NextDoseAction =
	| { scheme: "daily"; alreadyLoggedToday: boolean }
	| { scheme: "on_demand"; nextRole: "loading" | "plus24" | "plus48"; alreadyLoggedToday: boolean };

function isSameCalendarDay(a: number, b: number): boolean {
	const dateA = new Date(a);
	const dateB = new Date(b);
	return (
		dateA.getFullYear() === dateB.getFullYear() &&
		dateA.getMonth() === dateB.getMonth() &&
		dateA.getDate() === dateB.getDate()
	);
}

/**
 * What quick-log action(s) actually make sense to offer right now, instead
 * of always showing every button — e.g. once today's daily dose is logged
 * there's nothing left to do until tomorrow, and once a 2-1-1 loading dose
 * is logged the only sensible next step is its +24h/+48h follow-up, not
 * another loading dose.
 */
export function getNextDoseAction(
	events: PrepDoseEvent[],
	scheme: PrepScheme,
	now: number = Date.now(),
): NextDoseAction {
	const relevant = events.filter((event) => event.scheme === scheme);

	if (scheme === "daily") {
		const alreadyLoggedToday = relevant.some((event) => isSameCalendarDay(event.takenAt, now));
		return { scheme: "daily", alreadyLoggedToday };
	}

	// Same restriction as daily mode: at most one dose logged per calendar
	// day, regardless of role — the +24h/+48h follow-ups are never actually
	// due on the same day as the dose before them, so this only ever blocks
	// accidental duplicate taps, not legitimate same-day dosing.
	const alreadyLoggedToday = relevant.some((event) => isSameCalendarDay(event.takenAt, now));

	const sequences = buildOnDemandSequences(relevant);
	const current = sequences[sequences.length - 1];
	if (!current) {
		return { scheme: "on_demand", nextRole: "loading", alreadyLoggedToday };
	}
	if (!current.plus24) {
		return { scheme: "on_demand", nextRole: "plus24", alreadyLoggedToday };
	}
	if (!current.plus48) {
		return { scheme: "on_demand", nextRole: "plus48", alreadyLoggedToday };
	}
	// Sequence complete — ready for a fresh encounter's loading dose.
	return { scheme: "on_demand", nextRole: "loading", alreadyLoggedToday };
}

export type PrepStatusVariant = "positive" | "warning" | "negative" | "neutral";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function describeProtectionStatus(
	status: PrepProtectionStatus,
	t: TranslateFn,
): { label: string; variant: PrepStatusVariant } {
	switch (status.state) {
		case "protected":
			return {
				label: t("sexualHealth.status.protected", { defaultValue: "Protected" }),
				variant: "positive",
			};
		case "building":
			return {
				label: t("sexualHealth.status.building", { defaultValue: "Building protection" }),
				variant: "warning",
			};
		case "unprotected":
			return {
				label: t("sexualHealth.status.unprotected", { defaultValue: "Not currently protected" }),
				variant: "negative",
			};
		case "unknown":
		default:
			return {
				label: t("sexualHealth.status.unknown", { defaultValue: "Not tracked yet" }),
				variant: "neutral",
			};
	}
}
