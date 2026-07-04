import z from "zod";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

// Distinguishes *why* a location fetch failed so callers can show a message
// that actually tells the user what to do, instead of one generic "check
// your permissions" catch-all for every possible failure.
export type LocationErrorReason = "permission_denied" | "timeout" | "unavailable" | "network";

export class LocationAccessError extends Error {
	reason: LocationErrorReason;
	constructor(message: string, reason: LocationErrorReason) {
		super(message);
		this.reason = reason;
	}
}

export type CurrentLocationResult = {
	lat: number;
	lon: number;
	// false when resolved via IP-based approximation rather than a real GPS/network fix
	isPrecise: boolean;
};

// Maps a raw GeolocationPositionError (or the Tauri plugin's equivalent) to
// our reason enum. code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
// 3 = TIMEOUT (see MDN GeolocationPositionError).
function geolocationErrorReason(error: unknown): LocationErrorReason {
	const code = error && typeof error === "object" && "code" in error
		? (error as { code: unknown }).code
		: null;
	if (code === 1) return "permission_denied";
	if (code === 3) return "timeout";
	return "unavailable";
}

const ipGeolocationSchema = z.object({
	latitude: z.number(),
	longitude: z.number(),
});

async function getIpBasedLocation(): Promise<CurrentLocationResult> {
	const response = await fetch("https://ipapi.co/json/");
	if (!response.ok) {
		throw new LocationAccessError("IP-based location lookup failed", "network");
	}

	const data = ipGeolocationSchema.parse(await response.json());
	return { lat: data.latitude, lon: data.longitude, isPrecise: false };
}

// Both WebKitGTK (Linux) and WebView2 (Windows) implement the standard W3C
// Geolocation API themselves, backed by the OS's real location service
// (GeoClue2 / Windows Location). They just need the host app to allow the
// permission request, which src-tauri/src/lib.rs now does on both platforms.
function getBrowserLocation(): Promise<CurrentLocationResult> {
	return new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(
			(position) =>
				resolve({
					lat: position.coords.latitude,
					lon: position.coords.longitude,
					isPrecise: true,
				}),
			reject,
			{ enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 },
		);
	});
}

async function isMobilePlatform(): Promise<boolean> {
	try {
		const current = platform();
		return current === "ios" || current === "android";
	} catch (error) {
		appLog.warn("[current-location] Failed to read platform", error);
		return false;
	}
}

/**
 * The Tauri geolocation plugin only has a real backend on iOS/Android — on
 * desktop it's a stub that always reports a non-granted permission and a
 * (0, 0) position. Desktop builds instead use the embedded webview's own
 * navigator.geolocation (real OS location, see getBrowserLocation above),
 * falling back to an IP-based approximate location only if that fails
 * (e.g. no location service running on the machine).
 */
export async function getCurrentLocation(): Promise<CurrentLocationResult> {
	if (isTauriRuntime()) {
		if (await isMobilePlatform()) {
			const tauriGeo = await import("@tauri-apps/plugin-geolocation");
			let permissions = await tauriGeo.checkPermissions();
			if (permissions.location !== "granted" && permissions.location !== "denied") {
				permissions = await tauriGeo.requestPermissions(["location"]);
			}
			if (permissions.location !== "granted") {
				throw new LocationAccessError("Location permission denied", "permission_denied");
			}

			try {
				const position = await tauriGeo.getCurrentPosition({
					enableHighAccuracy: true,
					timeout: 12000,
					maximumAge: 20000,
				});
				return { lat: position.coords.latitude, lon: position.coords.longitude, isPrecise: true };
			} catch (error) {
				throw new LocationAccessError("Location request failed", geolocationErrorReason(error));
			}
		}

		try {
			return await getBrowserLocation();
		} catch (error) {
			// Expected on machines with no working OS location service (e.g. no
			// GeoClue2 daemon on Linux) — not an actual problem, just the signal
			// to fall back to IP-based location.
			appLog.info(
				"[current-location] navigator.geolocation unavailable, falling back to IP-based location",
				error,
			);
			try {
				return await getIpBasedLocation();
			} catch {
				// Both GPS and the IP fallback failed — the GPS error's reason is
				// the actionable one (e.g. permission denied), so surface that
				// rather than the IP lookup's generic network failure.
				throw new LocationAccessError("Location unavailable", geolocationErrorReason(error));
			}
		}
	}

	if ("geolocation" in navigator) {
		try {
			return await getBrowserLocation();
		} catch (error) {
			throw new LocationAccessError("Location request failed", geolocationErrorReason(error));
		}
	}

	return getIpBasedLocation();
}

// Maps a getCurrentLocation() failure to a translation key with an
// actionable, reason-specific message — callers just need t(key).
export function getLocationErrorMessageKey(error: unknown): string {
	const reason = error instanceof LocationAccessError ? error.reason : "unavailable";
	switch (reason) {
		case "permission_denied":
			return "browse_location.error_permission_denied";
		case "timeout":
			return "browse_location.error_timeout";
		case "network":
			return "browse_location.error_network";
		case "unavailable":
		default:
			return "browse_location.error_unavailable";
	}
}
