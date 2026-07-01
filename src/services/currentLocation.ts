import z from "zod";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

export class LocationAccessError extends Error {}

export type CurrentLocationResult = {
	lat: number;
	lon: number;
	// false when resolved via IP-based approximation rather than a real GPS/network fix
	isPrecise: boolean;
};

const ipGeolocationSchema = z.object({
	latitude: z.number(),
	longitude: z.number(),
});

async function getIpBasedLocation(): Promise<CurrentLocationResult> {
	const response = await fetch("https://ipapi.co/json/");
	if (!response.ok) {
		throw new LocationAccessError("IP-based location lookup failed");
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
				throw new LocationAccessError("Location permission denied");
			}

			const position = await tauriGeo.getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 12000,
				maximumAge: 20000,
			});
			return { lat: position.coords.latitude, lon: position.coords.longitude, isPrecise: true };
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
			return getIpBasedLocation();
		}
	}

	if ("geolocation" in navigator) {
		return getBrowserLocation();
	}

	return getIpBasedLocation();
}
