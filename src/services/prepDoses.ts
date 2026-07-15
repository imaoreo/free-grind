import { appLog } from "../utils/logger";
import z from "zod";
import { deletePrepDoseRow, getAllPrepDoses, insertPrepDose } from "./chatDb";
import { getNextDoseAction } from "./prepTracking";

const prepDoseSchema = z.object({
	id: z.string(),
	takenAt: z.number(),
	scheme: z.enum(["daily", "on_demand"]),
	doseRole: z.enum(["daily", "loading", "plus24", "plus48"]),
	note: z.string().nullable(),
});

export type PrepDose = z.infer<typeof prepDoseSchema>;

export async function loadPrepDoses(): Promise<PrepDose[]> {
	try {
		const rows = await getAllPrepDoses();
		const result: PrepDose[] = [];
		for (const row of rows) {
			const parsedItem = prepDoseSchema.safeParse(row);
			if (parsedItem.success) {
				result.push(parsedItem.data);
			}
		}
		return result;
	} catch (error) {
		appLog.error("[prepDoses] loadPrepDoses failed", error);
		return [];
	}
}

export type AddPrepDoseResult =
	| { ok: true; doses: PrepDose[] }
	| { ok: false; reason: "not_needed"; doses: PrepDose[] };

/**
 * Rejects doses that aren't the logically next one for the scheme (e.g. a
 * second daily dose on the same calendar day, or a fresh loading dose while
 * a 2-1-1 sequence is still waiting on its +24h/+48h follow-up) — enforced
 * here rather than only in the UI so no call site can bypass it, including
 * a double-tap race on the log button before the UI re-renders.
 */
export async function addPrepDose(input: {
	takenAt?: number;
	scheme: PrepDose["scheme"];
	doseRole: PrepDose["doseRole"];
	note?: string | null;
}): Promise<AddPrepDoseResult> {
	const current = await loadPrepDoses();
	const nextAction = getNextDoseAction(current, input.scheme);
	const isNeeded =
		nextAction.scheme === "daily"
			? input.doseRole === "daily" && !nextAction.alreadyLoggedToday
			: input.doseRole === nextAction.nextRole && !nextAction.alreadyLoggedToday;

	if (!isNeeded) {
		return { ok: false, reason: "not_needed", doses: current };
	}

	const entry: PrepDose = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		takenAt: input.takenAt ?? Date.now(),
		scheme: input.scheme,
		doseRole: input.doseRole,
		note: input.note ?? null,
	};
	const rows = await insertPrepDose(entry);
	return { ok: true, doses: rows };
}

export async function deletePrepDose(id: string): Promise<PrepDose[]> {
	const rows = await deletePrepDoseRow(id);
	return rows;
}
