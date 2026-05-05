import type { AlbumDetail } from "../../../types/albums";

export function countAlbumMedia(detail: AlbumDetail | undefined): {
	total: number;
	images: number;
	nonImages: number;
} {
	const content = detail?.content ?? [];
	const images = content.filter((item) =>
		(item.contentType ?? "").toLowerCase().startsWith("image/"),
	).length;
	const total = content.length;
	return {
		total,
		images,
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

export async function buildMultipartBody(file: File): Promise<{
	body: Uint8Array;
	contentType: string;
}> {
	const encoder = new TextEncoder();
	const boundary = `----opengrind-${crypto.randomUUID?.() ?? Date.now().toString(16)}`;
	const safeFilename = file.name.replace(/"/g, "_");
	const header =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="content"; filename="${safeFilename}"\r\n` +
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
