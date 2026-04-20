import z from "zod";

export const mediaHashSchema = z.string().regex(/^[a-f0-9]{32}$/i);

export function validateMediaHash(hash: string): boolean {
	return mediaHashSchema.safeParse(hash).success;
}
