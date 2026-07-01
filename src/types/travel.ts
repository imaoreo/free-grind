import z from "zod";

export const travelPlanSchema = z.object({
	travelPlanId: z.union([z.string(), z.number()]).transform((v) => Number(v)),
	profileId: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
	geohash: z.string(),
	startDate: z.number(),
	endDate: z.number(),
	showOnProfile: z.boolean().optional().default(false),
	notes: z.string().nullable().optional(),
});

export type TravelPlan = z.infer<typeof travelPlanSchema>;

export const travelPlansResponseSchema = z.object({
	travelPlans: z.array(travelPlanSchema).optional().default([]),
});

export type TravelPlanPayload = {
	travelPlanId?: number;
	profileId: number;
	geohash: string;
	startDate: number;
	endDate: number;
	showOnProfile: boolean;
	notes: string | null;
};
