import { appLog } from "../utils/logger";
import z from "zod";
import { deleteStiTestRow, getAllStiTests, insertStiTest, updateStiTestRow } from "./chatDb";

const stiTestSchema = z.object({
	id: z.string(),
	testedAt: z.number(),
	testType: z.enum(["full_panel", "hiv", "chlamydia", "gonorrhea", "syphilis", "other"]),
	result: z.enum(["pending", "negative", "positive"]),
	note: z.string().nullable(),
});

export type StiTest = z.infer<typeof stiTestSchema>;

export async function loadStiTests(): Promise<StiTest[]> {
	try {
		const rows = await getAllStiTests();
		const result: StiTest[] = [];
		for (const row of rows) {
			const parsedItem = stiTestSchema.safeParse(row);
			if (parsedItem.success) {
				result.push(parsedItem.data);
			}
		}
		return result;
	} catch (error) {
		appLog.error("[stiTests] loadStiTests failed", error);
		return [];
	}
}

export async function addStiTest(input: {
	testedAt: number;
	testType: StiTest["testType"];
	result: StiTest["result"];
	note?: string | null;
}): Promise<StiTest[]> {
	const entry: StiTest = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		testedAt: input.testedAt,
		testType: input.testType,
		result: input.result,
		note: input.note ?? null,
	};
	const rows = await insertStiTest(entry);
	return rows;
}

export async function updateStiTest(input: {
	id: string;
	testedAt: number;
	testType: StiTest["testType"];
	result: StiTest["result"];
	note?: string | null;
}): Promise<StiTest[]> {
	const entry: StiTest = {
		id: input.id,
		testedAt: input.testedAt,
		testType: input.testType,
		result: input.result,
		note: input.note ?? null,
	};
	const rows = await updateStiTestRow(entry);
	return rows;
}

export async function deleteStiTest(id: string): Promise<StiTest[]> {
	const rows = await deleteStiTestRow(id);
	return rows;
}
