import z from "zod";

export const homeLocationSchema = z.object({
	name: z.string(),
	lat: z.number(),
	lon: z.number(),
});

export type HomeLocation = z.infer<typeof homeLocationSchema>;
