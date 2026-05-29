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
 * Resizes and crops an image file to a 1024x1024 square Blob.
 * This ensures compatibility with legacy endpoints and prevents server-side cropping issues.
 */
export async function prepare1024SquareImage(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const { width, height } = bitmap;
	const side = Math.min(width, height);

	const canvas = document.createElement("canvas");
	canvas.width = 1024;
	canvas.height = 1024;
	const ctx = canvas.getContext("2d");

	if (!ctx) {
		bitmap.close();
		throw new Error("Failed to get canvas context");
	}

	// Draw centered square from original into 1024x1024 canvas
	ctx.drawImage(
		bitmap,
		(width - side) / 2,
		(height - side) / 2,
		side,
		side,
		0,
		0,
		1024,
		1024,
	);

	bitmap.close();

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Canvas to Blob failed"));
			},
			"image/jpeg",
			0.88,
		);
	});
}

/**
 * Calculates a centered square crop for an image file, scaled to a 1024-unit coordinate system.
 * This is often required for legacy media upload endpoints that have a maximum coordinate limit.
 */
export async function calculate1024ScaledSquareCrop(
	file: File,
): Promise<SquareCrop> {
	const bitmap = await createImageBitmap(file);
	const { width, height } = bitmap;
	const side = Math.min(width, height);

	const leftPx = (width - side) / 2;
	const topPx = (height - side) / 2;

	// Scale coordinates to a 1024-based system
	const crop = {
		top: Math.round((topPx / height) * 1024),
		left: Math.round((leftPx / width) * 1024),
		right: Math.round(((leftPx + side) / width) * 1024),
		bottom: Math.round(((topPx + side) / height) * 1024),
	};

	bitmap.close();
	return crop;
}
