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
