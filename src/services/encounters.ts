import { appLog } from "../utils/logger";
import z from "zod";
import { deleteEncounterRow, getAllEncounters, insertEncounter, updateEncounterRow } from "./chatDb";

const encounterSchema = z.object({
	id: z.string(),
	occurredAt: z.number(),
	profileId: z.string().nullable(),
	displayName: z.string(),
	tags: z.array(z.string()),
	note: z.string().nullable(),
	conversationId: z.string().nullable(),
});

export type Encounter = z.infer<typeof encounterSchema>;

export async function loadEncounters(): Promise<Encounter[]> {
	try {
		const rows = await getAllEncounters();
		const result: Encounter[] = [];
		for (const row of rows) {
			const parsedItem = encounterSchema.safeParse(row);
			if (parsedItem.success) {
				result.push(parsedItem.data);
			}
		}
		return result;
	} catch (error) {
		appLog.error("[encounters] loadEncounters failed", error);
		return [];
	}
}

export interface AddEncounterInput {
	occurredAt?: number;
	profileId?: string | null;
	displayName: string;
	tags?: string[];
	note?: string | null;
	conversationId?: string | null;
}

export async function addEncounter(input: AddEncounterInput): Promise<Encounter[]> {
	const entry: Encounter = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		occurredAt: input.occurredAt ?? Date.now(),
		profileId: input.profileId ?? null,
		displayName: input.displayName.trim(),
		tags: input.tags ?? [],
		note: input.note ?? null,
		conversationId: input.conversationId ?? null,
	};
	const rows = await insertEncounter(entry);
	return rows;
}

/** Convenience wrapper for the chat-header "I met this person now" entry point. */
export async function addEncounterFromConversation(input: {
	profileId: string;
	conversationId: string;
	displayName: string;
	tags?: string[];
	note?: string | null;
}): Promise<Encounter[]> {
	return addEncounter(input);
}

/**
 * Only tags and note are editable — who was met and when are locked in at
 * creation time and not exposed for editing (see chatDb.ts's
 * updateEncounterRow, which only ever writes those two columns).
 */
export async function updateEncounter(
	encounter: Encounter,
	updates: { tags: string[]; note: string | null },
): Promise<Encounter[]> {
	const rows = await updateEncounterRow({ ...encounter, tags: updates.tags, note: updates.note });
	return rows;
}

export async function deleteEncounter(id: string): Promise<Encounter[]> {
	const rows = await deleteEncounterRow(id);
	return rows;
}
