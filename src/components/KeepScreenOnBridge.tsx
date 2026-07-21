/**
 * KeepScreenOnBridge — while the "Keep Screen On" preference is enabled,
 * holds a Screen Wake Lock for as long as the app is open, so the display
 * doesn't dim or lock. The lock is only ever released by the browser/OS
 * (app backgrounded/closed) or by the user turning the preference off —
 * never on a timer.
 *
 * Uses the standard Wake Lock API (`navigator.wakeLock`), which is present
 * in WebView2 (Windows) and the Android/iOS system webviews without any
 * native code. It's unsupported in WebKitGTK (Linux desktop), where this
 * silently no-ops — the same kind of platform gap as video calls there.
 */

import { useEffect, useRef } from "react";
import { usePreferences } from "../contexts/PreferencesContext";
import { appLog } from "../utils/logger";

export function KeepScreenOnBridge() {
	const { keepScreenOn } = usePreferences();
	const sentinelRef = useRef<WakeLockSentinel | null>(null);

	useEffect(() => {
		if (!keepScreenOn || !("wakeLock" in navigator)) {
			return;
		}

		let cancelled = false;

		const acquire = async () => {
			try {
				const sentinel = await navigator.wakeLock.request("screen");
				if (cancelled) {
					await sentinel.release().catch(() => {});
					return;
				}
				sentinelRef.current = sentinel;
			} catch (error) {
				appLog.warn("[keep-screen-on] wake lock request failed", error);
			}
		};

		void acquire();

		// The API releases the sentinel automatically whenever the document
		// goes hidden (backgrounded/minimized) — reacquire it once the app is
		// foregrounded again, since nothing else will.
		const onVisibility = () => {
			if (document.visibilityState === "visible" && !sentinelRef.current) {
				void acquire();
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibility);
			sentinelRef.current?.release().catch(() => {});
			sentinelRef.current = null;
		};
	}, [keepScreenOn]);

	return null;
}
