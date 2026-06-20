import { createElement } from "react";
import toast from "react-hot-toast";
import { Ban } from "lucide-react";
import { ApiFunctionError } from "./apiHelpers";
import { blockedMeStore } from "./blockedMeStore";
import { getOtherParticipant } from "../pages/app/chat/chatUtils";
import type { ConversationEntry } from "../types/messages";
import { appLog } from "../utils/logger";

type DetectionApi = {
	getProfileDetail: (profileId: string) => Promise<
		| {
				displayName?: string | null;
				aboutMe?: string | null;
				age?: number | null;
				medias?: unknown[] | null;
		  }
		| null
		| undefined
	>;
	getBlockedProfileIds: () => Promise<string[]>;
};

const MAX_CONFIRMATIONS_PER_RUN = 5;
// Any API error on a convo that disappered is treated as a block
// signal, theres a few mor checks but im lazy to explin, its 3am
type ConfirmResult = "confirmed" | "still-visible" | "inconclusive";

type CandidateResult = {
	profileId: string;
	displayName: string;
	result: ConfirmResult;
	detail: string;
};

export type DetectionSummary = {
	totalWatching: number;
	candidates: CandidateResult[];
};

export function notifyBlockedMe(displayName: string) {
	// In app only,this can only !ever! fire while the app is open and the
	// sweep runs
	toast(`${displayName} blocked you`, { icon: createElement(Ban, { className: "h-5 w-5 text-red-500" }) });
}

type ProbeSignal =
	| { kind: "blocked-signal"; detail: string }
	| { kind: "normal"; detail: string }
	| { kind: "unknown"; detail: string };

async function probeOnce(api: DetectionApi, profileId: string): Promise<ProbeSignal> {
	try {
		const profile = await api.getProfileDetail(profileId);
		if (!profile) {
			return { kind: "unknown", detail: "profile fetch returned nothing" };
		}
		// Grindr doesnt 404 a profile you hav been blocked by, thanks. it returns a
		// 200 with aboutMe/age/medias all nulled out.......
		// NOTE for future readers, tho its obvius but: displayName alone is NOT a reliable signal, Require aboutMe, age, AND photos to all be missing at once
		const hasNoBio = profile.aboutMe == null;
		const hasNoAge = profile.age == null;
		const hasNoPhotos = !profile.medias || profile.medias.length === 0;
		if (hasNoBio && hasNoAge && hasNoPhotos) {
			return {
				kind: "blocked-signal",
				detail: `profile looks like shit, its a code 200. (name: "${profile.displayName}", aboutMe/age/medias all empty)`,
			};
		}
		return {
			kind: "normal",
			detail: `profile still fetchable (name: ${profile.displayName}, aboutMe: ${hasNoBio ? "empty" : "present"}, age: ${hasNoAge ? "empty" : profile.age}, photos: ${hasNoPhotos ? 0 : profile.medias!.length})`,
		};
	} catch (error) {
		if (error instanceof ApiFunctionError) {
			return { kind: "blocked-signal", detail: `profile fetch failed with HTTP ${error.status}` };
		}
		const message = error instanceof Error ? error.message : String(error);
		return { kind: "unknown", detail: `non-HTTP error: ${message}` };
	}
}

const RECHECK_DELAY_MS = 2000;

export async function confirmBlockedByThem(
	api: DetectionApi,
	profileId: string,
	blockedByMeIds: Set<string>,
): Promise<{ result: ConfirmResult; detail: string }> {
	if (blockedByMeIds.has(profileId)) {
		// if you are dumb lol
		return { result: "still-visible", detail: "in your own block list" };
	}

	// two consistent reads (spaced apart)
	const first = await probeOnce(api, profileId);
	if (first.kind === "normal") {
		return { result: "still-visible", detail: first.detail };
	}

	await new Promise((resolve) => setTimeout(resolve, RECHECK_DELAY_MS));
	const second = await probeOnce(api, profileId);

	if (first.kind === "blocked-signal" && second.kind === "blocked-signal") {
		return { result: "confirmed", detail: `confirmed twice, first: ${first.detail}; second: ${second.detail}` };
	}
	if (second.kind === "normal") {
		return { result: "still-visible", detail: `second check looked normal: ${second.detail}` };
	}
	return {
		result: "inconclusive",
		detail: `inconsistent readings (first: ${first.kind} — ${first.detail}; second: ${second.kind} — ${second.detail}), retrying later`,
	};
}

let sweepInFlight = false;

export async function runBlockedMeDetection(
	api: DetectionApi,
	entries: ConversationEntry[],
	userId: number | null,
	isFullRefresh: boolean,
): Promise<DetectionSummary> {
	if (userId == null) return { totalWatching: 0, candidates: [] };

	// The bridge own timer and a pagelevel inbox refresh can land at nearly
	// the same time, this makes it so there isnt a duplicate notification. if that makes sense
	if (isFullRefresh && sweepInFlight) {
		return { totalWatching: 0, candidates: [] };
	}

	const now = Date.now();
	const currentProfileIds = new Set<string>();
	const watching: Array<{ profileId: string; conversationId: string; displayName: string; avatarHash: string | null; lastSeenAt: number }> = [];

	for (const entry of entries) {
		const other = getOtherParticipant(entry, userId);
		if (!other?.profileId) continue;
		const profileId = String(other.profileId);
		currentProfileIds.add(profileId);
		watching.push({
			profileId,
			conversationId: entry.data.conversationId,
			displayName: entry.data.name || profileId,
			avatarHash: other.primaryMediaHash ?? null,
			lastSeenAt: now,
		});
	}

	try {
		await blockedMeStore.upsertWatching(watching);
	} catch (error) {
		appLog.warn("[blockDetection] failed to upsert watching snapshots", error);
	}

	if (!isFullRefresh) return { totalWatching: 0, candidates: [] };

	sweepInFlight = true;
	try {
		const allRecords = await blockedMeStore.getAll();
		const totalWatching = allRecords.filter((record) => record.status === "watching").length;
		const candidates = allRecords.filter(
			(record) => record.status === "watching" && !currentProfileIds.has(record.profileId),
		);
		if (candidates.length === 0) return { totalWatching, candidates: [] };

		appLog.warn(`[blockDetection] sweep found ${candidates.length} disappeared conversation(s) to check`);

		const blockedByMeIds = new Set(await api.getBlockedProfileIds());
		const results: CandidateResult[] = [];

		for (const candidate of candidates.slice(0, MAX_CONFIRMATIONS_PER_RUN)) {
			const { result, detail } = await confirmBlockedByThem(api, candidate.profileId, blockedByMeIds);
			appLog.warn(`[blockDetection] profile ${candidate.profileId} (${candidate.displayName}) -> ${result}: ${detail}`);
			results.push({ profileId: candidate.profileId, displayName: candidate.displayName, result, detail });
			if (result === "confirmed") {
				await blockedMeStore.markConfirmed(candidate.profileId, Date.now());
				void notifyBlockedMe(candidate.displayName);
			} else if (result === "still-visible") {
				await blockedMeStore.removeRecord(candidate.profileId);
			}
			// "inconclusive", js leave as watching, retry on next full refresh
		}

		return { totalWatching, candidates: results };
	} catch (error) {
		appLog.warn("[blockDetection] detection sweep failed", error);
		return { totalWatching: 0, candidates: [] };
	} finally {
		sweepInFlight = false;
	}
}

export async function removeBlockedMeWatch(profileId: string): Promise<void> {
	try {
		await blockedMeStore.removeRecord(profileId);
	} catch (error) {
		appLog.warn("[blockDetection] failed to remove watch record", error);
	}
}
