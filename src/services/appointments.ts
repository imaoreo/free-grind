import { appLog } from "../utils/logger";
import z from "zod";
import {
	deleteAppointmentRow,
	getAllAppointments,
	insertAppointment,
	updateAppointmentCompletion,
} from "./chatDb";

const appointmentSchema = z.object({
	id: z.string(),
	title: z.string(),
	scheduledAt: z.number(),
	kind: z.enum(["prep_followup", "sti_screening", "other"]),
	location: z.string().nullable(),
	note: z.string().nullable(),
	completedAt: z.number().nullable(),
});

export type Appointment = z.infer<typeof appointmentSchema>;

export async function loadAppointments(): Promise<Appointment[]> {
	try {
		const rows = await getAllAppointments();
		const result: Appointment[] = [];
		for (const row of rows) {
			const parsedItem = appointmentSchema.safeParse(row);
			if (parsedItem.success) {
				result.push(parsedItem.data);
			}
		}
		return result;
	} catch (error) {
		appLog.error("[appointments] loadAppointments failed", error);
		return [];
	}
}

export async function addAppointment(input: {
	title: string;
	scheduledAt: number;
	kind: Appointment["kind"];
	location?: string | null;
	note?: string | null;
}): Promise<Appointment[]> {
	const entry: Appointment = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		title: input.title.trim(),
		scheduledAt: input.scheduledAt,
		kind: input.kind,
		location: input.location ?? null,
		note: input.note ?? null,
		completedAt: null,
	};
	const rows = await insertAppointment(entry);
	return rows;
}

export async function completeAppointment(id: string, completed = true): Promise<Appointment[]> {
	const rows = await updateAppointmentCompletion(id, completed ? Date.now() : null);
	return rows;
}

export async function deleteAppointment(id: string): Promise<Appointment[]> {
	const rows = await deleteAppointmentRow(id);
	return rows;
}
