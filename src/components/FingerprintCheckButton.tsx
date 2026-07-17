import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FingerprintResult {
	ja3_hash: string;
	ja3_match: boolean;
	http_version: string;
	akamai_fingerprint: string;
	akamai_match: boolean;
	full_response: Record<string, unknown>;
}

export function useFingerprintCheck() {
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<FingerprintResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const checkFingerprint = async () => {
		setLoading(true);
		setError(null);
		setResult(null);

		try {
			const response = await invoke<FingerprintResult>("check_fingerprint");
			setResult(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

	const ok = result != null && result.ja3_match && result.akamai_match;

	return { loading, result, error, ok, checkFingerprint };
}

export type { FingerprintResult };
