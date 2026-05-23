import z from "zod";
import type { ProfileImageSize, ThumbImageSize } from "../types/media";

export const mediaHashSchema = z
	.string()
	.regex(/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i);

const PUBLIC_MEDIA_BASE_URL = "https://cdns.grindr.com";

export function validateMediaHash(hash: string): boolean {
	return mediaHashSchema.safeParse(hash.trim()).success;
}

export function getProfileImageUrl(
	hash: string,
	size: ProfileImageSize = "480x480",
): string {
	return `${PUBLIC_MEDIA_BASE_URL}/images/profile/${size}/${hash}`;
}

export function getThumbImageUrl(
	hash: string,
	size: ThumbImageSize = "320x320",
): string {
	return `${PUBLIC_MEDIA_BASE_URL}/images/thumb/${size}/${hash}`;
}

export interface SquareCrop {
	top: number;
	left: number;
	right: number;
	bottom: number;
}

/**
 * Calculates a centered square crop for an image file.
 * Returns coordinates in pixels: top, left, right, bottom.
 */
export async function calculateSquareCrop(file: File): Promise<SquareCrop> {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const left = Math.round((bitmap.width - side) / 2);
	const top = Math.round((bitmap.height - side) / 2);
	const right = left + side;
	const bottom = top + side;
	bitmap.close();

	return { top, left, right, bottom };
}
