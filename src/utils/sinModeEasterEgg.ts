const EVIL_TAP_ID = 2;

const SIN_MODE_PROFILE_HASHES = new Set([
	"d620c656c85c7d876f28d4070fdda36a9604fd3f24e70df2e4ae924cdfa868b6",
	"b002fcf1906800162a66aa01279281e7bc49d5d7921ec1bf35841382483cbbdc",
	"18e722ef9e949fbee221fae13d53c69e8287785daee63a2a525293e552a4d320",
]);

async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function registerTapForSinMode(tapId: number, profileId: string): Promise<boolean> {
	if (tapId !== EVIL_TAP_ID) {
		return false;
	}
	const hash = await sha256Hex(profileId);
	return SIN_MODE_PROFILE_HASHES.has(hash);
}

type SinModeListener = () => void;
const listeners = new Set<SinModeListener>();

export function subscribeSinModeUnlock(listener: SinModeListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function triggerSinModeUnlock(): void {
	for (const listener of listeners) {
		listener();
	}
}
