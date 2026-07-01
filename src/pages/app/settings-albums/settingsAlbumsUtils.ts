import type { AlbumDetail } from "../../../types/albums";

export function countAlbumMedia(detail: AlbumDetail | undefined): {
	total: number;
	images: number;
	videos: number;
	nonImages: number;
} {
	const content = detail?.content ?? [];
	const images = content.filter((item) =>
		(item.contentType ?? "").toLowerCase().startsWith("image/"),
	).length;
	const videos = content.filter((item) =>
		(item.contentType ?? "").toLowerCase().startsWith("video/"),
	).length;
	const total = content.length;
	return {
		total,
		images,
		videos,
		nonImages: Math.max(0, total - images),
	};
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
	const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const output = new Uint8Array(totalBytes);
	let offset = 0;

	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}

	return output;
}


export function getVideodimensions(file: File): Promise<{ width: number; height: number } | undefined> {
	return new Promise((resolve) => {
		const vid = document.createElement("video");
		vid.preload = "metadata";
		const objUrl = URL.createObjectURL(file);
		vid.onloadedmetadata = () => {
			URL.revokeObjectURL(objUrl);
			const { videoWidth, videoHeight } = vid;
			resolve(videoWidth > 0 && videoHeight > 0 ? { width: videoWidth, height: videoHeight } : undefined);
		};
		vid.onerror = () => { URL.revokeObjectURL(objUrl); resolve(undefined); };
		vid.src = objUrl;
	});
}

/** Returns the duration of a video file in milliseconds, or null if unreadable. */
export function getVideoDurationMs(file: File): Promise<number | null> {
	return new Promise((resolve) => {
		const vid = document.createElement("video");
		vid.preload = "metadata";
		const objUrl = URL.createObjectURL(file);
		vid.onloadedmetadata = () => {
			URL.revokeObjectURL(objUrl);
			const { duration } = vid;
			resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null);
		};
		vid.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
		vid.src = objUrl;
	});
}

export async function buildMultipartBody(file: File): Promise<{
	body: Uint8Array;
	contentType: string;
}> {
	const encoder = new TextEncoder();
	const boundary = `----opengrind-${crypto.randomUUID?.() ?? Date.now().toString(16)}`;
	const header =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="content"; filename=""\r\n` +
		`Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;
	const footer = `\r\n--${boundary}--\r\n`;

	const fileBytes = new Uint8Array(await file.arrayBuffer());
	const body = concatUint8Arrays([
		encoder.encode(header),
		fileBytes,
		encoder.encode(footer),
	]);

	return {
		body,
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}
