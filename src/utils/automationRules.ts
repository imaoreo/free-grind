import { getSetting, setSetting } from "../services/chatDb";
import { getForbiddenWords, notifyAutoBlock } from "./autoblock";
import { appLog } from "./logger";
import type { ProfileDetail } from "../types/grid";

// ---------------------------------------------------------------------------
// Custom automation rules — user-defined "when X then Y" chat automations,
// distinct from the built-in keyword/age auto-block in autoblock.ts.
//
// "new_chat" and "tap_received" are one-shot: a rule fires the very first
// time that trigger happens from a given sender, then never evaluates that
// (trigger, sender) pair again, regardless of whether any rule matched.
// "new_chat" is evaluated from three call sites so it covers messages that
// arrived while the app was fully closed, not just the live WebSocket case:
//  - ChatRealtimeBridge.tsx: live incoming messages (profile fetched lazily)
//  - ChatPage.tsx: historical scan when a thread is opened (profile already
//    fetched there, passed in as a snapshot to avoid a second request)
//  - chatService.ts listConversations(): inbox reconciliation on app launch
//    (age/photo already present on the inbox preview, no extra request)
// "tap_received" only has a live call site for now — there's no local record
// of taps received while the app was closed to reconcile against on launch.
//
// "message_received" is different: instead of deduping per sender, it dedupes
// per *message* (by messageId), so it fires exactly once per actual message
// rather than once ever per sender. That's what lets it back a per-message
// condition like "message contains keyword" (the custom-rule equivalent of
// the legacy forbidden-keywords auto-block) and still be safely replayed
// from all three call sites the same way "new_chat" is — a message already
// acted on is skipped, but a message that arrived while the app was closed
// still gets exactly one evaluation once it's seen.
// ---------------------------------------------------------------------------

export type AutomationTrigger = "new_chat" | "tap_received" | "message_received";

export type AutomationRuleCondition =
	| { type: "profile_picture"; has: boolean }
	| { type: "age_above"; value: number }
	| { type: "age_below"; value: number }
	| { type: "bio_contains_keyword"; keywords: string; useForbiddenList?: boolean; negate?: boolean }
	| { type: "message_contains_keyword"; keywords: string; useForbiddenList?: boolean; negate?: boolean }
	| { type: "display_name_contains_keyword"; keywords: string; useForbiddenList?: boolean; negate?: boolean };

export type AutomationRuleAction =
	| { type: "block" }
	| { type: "send_message"; text: string }
	| { type: "share_album"; albumId: number; albumName?: string };

export interface AutomationRule {
	id: string;
	enabled: boolean;
	name: string;
	// i18n key for built-in/locked rules — takes precedence over `name` for
	// display so the default rule's title follows the app language instead of
	// being frozen in whatever language it was seeded in. Cleared the moment a
	// user edits the name, since a hand-typed name is no longer a translation.
	nameKey?: string;
	// A rule fires if *any* of its triggers happen (OR) — e.g. one rule that
	// reacts to both "new_chat" and "tap_received" instead of needing two
	// separate, identical rules. Always at least one.
	triggers: AutomationTrigger[];
	// "all" (default) requires every condition to match (AND); "any" requires
	// just one (OR) — e.g. "younger than 18 OR older than 99" needs "any",
	// since AND on those two could never be true at once.
	matchMode: "all" | "any";
	conditions: AutomationRuleCondition[];
	actions: AutomationRuleAction[];
	// Built-in rules (e.g. the age-range block that replaces the old Age
	// Limits setting) that replace fixed app functionality — can be edited
	// and disabled like any other rule, just not deleted.
	locked?: boolean;
}

// Minimal profile shape rule conditions need. A full ProfileDetail satisfies
// this; call sites that already have age/photo/bio inline (inbox previews)
// can pass a plain object instead of fetching the full profile.
export interface AutomationProfileSnapshot {
	age?: number | null;
	profileImageMediaHash?: string | null;
	aboutMe?: string | null;
	displayName?: string | null;
}

const AUTOMATION_RULES_KEY = "automation_rules";
const AUTOMATION_SEEN_SENDERS_KEY = "automation_seen_senders";
// Bumped to v2 when the default age rule changed shape (two deletable,
// unlocked rules -> one locked rule with matchMode "any") — profiles that
// already ran the v1 seed (and so have the flag set, whether or not they
// kept those old rules) need this to fire again to get the new one.
const AUTOMATION_AGE_DEFAULTS_SEEDED_KEY = "automation_age_defaults_seeded_v2";
const AUTOMATION_KEYWORDS_DEFAULTS_SEEDED_KEY = "automation_keywords_defaults_seeded";

const VALID_TRIGGERS: AutomationTrigger[] = ["new_chat", "tap_received", "message_received"];

// Replaces the old built-in "Age Limits" auto-block (a single min/max setting
// gated by the "Apply to Inbox" toggle) with an equivalent disabled-by-default
// rule. matchMode "any" is what makes one rule work here: with the default
// "all" (AND), an age_below and an age_above condition could never both be
// true at once (that's "inside" a range, not "outside" it) — "any" (OR) is
// what actually reproduces "block anyone younger than X OR older than Y".
// Locked so it can't be deleted, since it stands in for built-in behavior —
// still fully editable/disableable like any other rule.
function createDefaultAgeLimitRule(): AutomationRule {
	return {
		id: crypto.randomUUID(),
		enabled: false,
		name: "Age limit block",
		nameKey: "settings_automation.default_age_rule_name",
		triggers: ["new_chat"],
		matchMode: "any",
		conditions: [
			{ type: "age_below", value: 18 },
			{ type: "age_above", value: 99 },
		],
		actions: [{ type: "block" }],
		locked: true,
	};
}

// Replaces the legacy forbidden-keywords auto-block (the "Apply to Inbox"
// toggle, which checked display name, bio, and message text — "chat" context
// only) with an equivalent rule that also covers taps, and reuses the same
// keyword list via useForbiddenList rather than duplicating it. Disabled by
// default, locked like the age-range rule.
function createDefaultForbiddenKeywordsRule(): AutomationRule {
	return {
		id: crypto.randomUUID(),
		enabled: false,
		name: "Forbidden keywords block",
		nameKey: "settings_automation.default_keywords_rule_name",
		triggers: ["new_chat", "message_received", "tap_received"],
		matchMode: "any",
		conditions: [
			{ type: "display_name_contains_keyword", keywords: "", useForbiddenList: true },
			{ type: "bio_contains_keyword", keywords: "", useForbiddenList: true },
			{ type: "message_contains_keyword", keywords: "", useForbiddenList: true },
		],
		actions: [{ type: "block" }],
		locked: true,
	};
}

let rulesCache: AutomationRule[] = [];
let seenSendersCache: Set<string> = new Set();
// Guards runAutomationRulesForSender against evaluating (and permanently
// marking senders "seen" for) a profile whose rules/seen-history haven't
// loaded yet — some sync jobs (inbox sync, taps sync) are deliberately
// kicked off before this cache finishes loading so they aren't delayed by
// it, and would otherwise race it on a fresh launch or account switch.
let rulesCacheReady = false;

export async function loadAutomationRulesCache(): Promise<void> {
	rulesCacheReady = false;
	try {
		const stored = await getSetting<AutomationRule[]>(AUTOMATION_RULES_KEY);
		// Normalize fields saved before they existed (or otherwise invalid)
		// instead of dropping the rule. No migration for pre-multi-trigger
		// rules — this is still under active development, nothing to preserve.
		rulesCache = (Array.isArray(stored) ? stored : []).map((r) => {
			const triggers = Array.isArray(r.triggers) ? r.triggers.filter((t) => VALID_TRIGGERS.includes(t)) : [];
			return {
				...r,
				triggers: triggers.length > 0 ? triggers : (["new_chat"] as AutomationTrigger[]),
				matchMode: r.matchMode === "any" ? "any" : "all",
			};
		});

		// One-time seeds, independent of whether rulesCache is currently empty —
		// a flag rather than "seed only if stored === null" so each also reaches
		// profiles that already have other custom rules saved.
		let seededSomething = false;
		if (!(await getSetting<boolean>(AUTOMATION_AGE_DEFAULTS_SEEDED_KEY))) {
			rulesCache = [...rulesCache, createDefaultAgeLimitRule()];
			await setSetting(AUTOMATION_AGE_DEFAULTS_SEEDED_KEY, true).catch(() => {});
			seededSomething = true;
		}
		if (!(await getSetting<boolean>(AUTOMATION_KEYWORDS_DEFAULTS_SEEDED_KEY))) {
			rulesCache = [...rulesCache, createDefaultForbiddenKeywordsRule()];
			await setSetting(AUTOMATION_KEYWORDS_DEFAULTS_SEEDED_KEY, true).catch(() => {});
			seededSomething = true;
		} else {
			// Fixup rather than re-seed: the keywords default rule was seeded
			// before it had a display_name_contains_keyword condition — add it
			// in place for anyone who already has the rule, instead of adding a
			// duplicate second rule via a new seed flag.
			rulesCache = rulesCache.map((r) => {
				if (r.nameKey !== "settings_automation.default_keywords_rule_name") return r;
				const hasDisplayNameCondition = r.conditions.some((c) => c.type === "display_name_contains_keyword");
				if (hasDisplayNameCondition) return r;
				seededSomething = true;
				return {
					...r,
					conditions: [
						{ type: "display_name_contains_keyword" as const, keywords: "", useForbiddenList: true },
						...r.conditions,
					],
				};
			});
		}
		if (seededSomething) {
			await setSetting(AUTOMATION_RULES_KEY, rulesCache).catch(() => {});
		}
	} catch (error) {
		appLog.error("[AutomationRules] failed to load rules", error);
		rulesCache = [];
	}
	try {
		const stored = await getSetting<string[]>(AUTOMATION_SEEN_SENDERS_KEY);
		seenSendersCache = new Set(Array.isArray(stored) ? stored : []);
	} catch (error) {
		appLog.error("[AutomationRules] failed to load seen-senders history", error);
		seenSendersCache = new Set();
	}
	rulesCacheReady = true;
}

export function getAutomationRules(): AutomationRule[] {
	return rulesCache;
}

export async function setAutomationRules(rules: AutomationRule[]): Promise<void> {
	rulesCache = rules;
	await setSetting(AUTOMATION_RULES_KEY, rules);
}

export function createEmptyAutomationRule(): AutomationRule {
	return {
		id: crypto.randomUUID(),
		enabled: true,
		name: "",
		triggers: ["new_chat"],
		matchMode: "all",
		conditions: [],
		actions: [],
	};
}

function seenKey(trigger: AutomationTrigger, senderId: string): string {
	return `${trigger}:${senderId}`;
}

async function markSeen(trigger: AutomationTrigger, senderId: string): Promise<void> {
	seenSendersCache.add(seenKey(trigger, senderId));
	await setSetting(AUTOMATION_SEEN_SENDERS_KEY, Array.from(seenSendersCache));
}

// "new_chat"/"tap_received" fire once ever per sender — deleting a
// conversation should free that sender up again, otherwise re-contacting
// someone you've deleted looks (from the user's perspective) like the
// automation system is broken, since it silently never re-evaluates them.
// Doesn't touch "message_received" entries (those are keyed by messageId,
// not sender — deleting old messages doesn't invalidate them, and a new
// conversation naturally has new messageIds anyway).
export async function clearAutomationSeenHistoryForSender(senderId: string): Promise<void> {
	let changed = false;
	for (const trigger of ["new_chat", "tap_received"] as const) {
		changed = seenSendersCache.delete(seenKey(trigger, senderId)) || changed;
	}
	if (!changed) return;
	await setSetting(AUTOMATION_SEEN_SENDERS_KEY, Array.from(seenSendersCache));
}

// Same word-boundary, longest-keyword-first approach as autoblock.ts's
// getMatchedForbiddenWord, just stateless — rule conditions carry their own
// per-condition keyword list rather than the one global forbidden-words
// setting, and are checked rarely enough (rule evaluation, not every
// keystroke) that there's no need for autoblock.ts's regex cache.
function textContainsKeyword(text: string | null | undefined, keywordsCsv: string): boolean {
	if (!text) return false;
	const keywords = keywordsCsv
		.split(",")
		.map((word) => word.trim().toLowerCase())
		.filter((word) => word.length > 0);
	if (keywords.length === 0) return false;

	const sorted = [...keywords].sort((a, b) => b.length - a.length);
	const pattern = sorted.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
	const regex = new RegExp(`(?:^|\\W)(${pattern})(?:$|\\W)`, "i");
	return regex.test(text.toLowerCase());
}

function conditionMatches(
	condition: AutomationRuleCondition,
	profile: AutomationProfileSnapshot | null,
	messageText: string | null,
): boolean {
	switch (condition.type) {
		case "profile_picture":
			return !!profile?.profileImageMediaHash === condition.has;
		// !!profile?.age (not just != null) so a 0/unset age is never treated as
		// "younger than X" — some profiles report age as 0 rather than null
		// when it isn't set, and nobody's real age is 0.
		case "age_above":
			return !!profile?.age && profile.age > condition.value;
		case "age_below":
			return !!profile?.age && profile.age < condition.value;
		case "bio_contains_keyword":
			return (
				textContainsKeyword(profile?.aboutMe, condition.useForbiddenList ? getForbiddenWords() : condition.keywords) !==
				!!condition.negate
			);
		case "message_contains_keyword":
			return (
				textContainsKeyword(messageText, condition.useForbiddenList ? getForbiddenWords() : condition.keywords) !==
				!!condition.negate
			);
		case "display_name_contains_keyword":
			return (
				textContainsKeyword(profile?.displayName, condition.useForbiddenList ? getForbiddenWords() : condition.keywords) !==
				!!condition.negate
			);
	}
}

export interface AutomationActionRunner {
	blockProfile: (profileId: string) => Promise<unknown>;
	sendText: (payload: { targetProfileId: number; text: string }) => Promise<unknown>;
	shareAlbum: (payload: {
		albumId: number;
		profiles: { profileId: number; expirationType: "INDEFINITE" }[];
	}) => Promise<unknown>;
	// Only needed when no prefetchedProfile is passed to runAutomationRulesForSender.
	getProfileDetail?: (profileId: string) => Promise<ProfileDetail>;
}

export interface RunAutomationRulesResult {
	blocked: boolean;
	matchedRuleNames: string[];
}

/**
 * Evaluates every enabled rule matching `trigger` for a sender. "new_chat"
 * and "tap_received" fire once ever per (trigger, sender) pair — the
 * seen-cache short-circuits every call after the first, so repeatedly
 * re-scanning the same conversation (inbox reconciliation on every app
 * launch, re-opening a thread) doesn't re-send messages or re-share albums.
 * "message_received" fires once per *message* instead (deduped by the
 * required `messageId` argument), so it's safe to call from all three sites
 * like "new_chat" — see module docstring.
 * Stops (and reports blocked=true) as soon as a "block" action fires, since
 * there is no longer a conversation left to act on.
 */
export async function runAutomationRulesForSender(
	senderId: string,
	trigger: AutomationTrigger,
	runner: AutomationActionRunner,
	prefetchedProfile?: AutomationProfileSnapshot | null,
	messageText?: string | null,
	messageId?: string | null,
): Promise<RunAutomationRulesResult> {
	const result: RunAutomationRulesResult = { blocked: false, matchedRuleNames: [] };

	if (!rulesCacheReady) return result;

	// "new_chat"/"tap_received" dedupe per sender (fires once ever). "message_received"
	// dedupes per *message* instead, keyed by messageId — that's what lets it be safely
	// replayed from inbox reconciliation/thread-open scans (like "new_chat" is) without
	// re-running non-idempotent actions on a message it already acted on, while still
	// evaluating every genuinely new message exactly once — the piece "new_chat" alone
	// can't cover, since that only ever looks at a sender's very first message.
	const dedupeId = trigger === "message_received" ? messageId : senderId;
	if (dedupeId == null) return result;
	if (seenSendersCache.has(seenKey(trigger, dedupeId))) return result;
	await markSeen(trigger, dedupeId).catch(() => {});

	const rules = rulesCache.filter((r) => r.enabled && r.triggers.includes(trigger));
	if (rules.length === 0) return result;

	let profile: AutomationProfileSnapshot | null = prefetchedProfile ?? null;
	let profileFetchAttempted = prefetchedProfile !== undefined;

	for (const rule of rules) {
		const needsProfile = rule.conditions.some((c) => c.type !== "message_contains_keyword");
		if (needsProfile && !profileFetchAttempted) {
			profileFetchAttempted = true;
			try {
				profile = runner.getProfileDetail ? await runner.getProfileDetail(senderId) : null;
			} catch (error) {
				appLog.warn("[AutomationRules] failed to fetch profile for rule evaluation", error);
				profile = null;
			}
		}

		// A rule with no conditions always matches (nothing to check) rather
		// than being skipped — lets a rule be a plain "trigger -> action" with
		// no filtering, e.g. "on message received, always send an auto-reply".
		const matches =
			rule.conditions.length === 0
				? true
				: rule.matchMode === "any"
					? rule.conditions.some((condition) => conditionMatches(condition, profile, messageText ?? null))
					: rule.conditions.every((condition) => conditionMatches(condition, profile, messageText ?? null));

		if (!matches) continue;

		result.matchedRuleNames.push(rule.name || rule.id);

		for (const action of rule.actions) {
			try {
				if (action.type === "block") {
					await runner.blockProfile(senderId);
					result.blocked = true;
					notifyAutoBlock(profile?.displayName || senderId, rule.name || "Automation rule");
				} else if (action.type === "send_message") {
					await runner.sendText({ targetProfileId: Number(senderId), text: action.text });
				} else if (action.type === "share_album") {
					await runner.shareAlbum({
						albumId: action.albumId,
						profiles: [{ profileId: Number(senderId), expirationType: "INDEFINITE" }],
					});
				}
			} catch (error) {
				appLog.error(`[AutomationRules] action "${action.type}" failed for rule "${rule.name}"`, error);
			}
		}

		if (result.blocked) break;
	}

	return result;
}
