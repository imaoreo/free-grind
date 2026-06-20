/**
 * Exports json data to a file usin native share sheet. Falls back to
 * the anchordownload approach where the Share API isn't available, akaka android/pc
 */
export async function shareOrDownloadJson(filename: string, data: unknown): Promise<void> {
	const json = JSON.stringify(data, null, 2);
	const file = new File([json], filename, { type: "application/json" });

	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file] });
			return;
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			throw error;
		}
	}

	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
