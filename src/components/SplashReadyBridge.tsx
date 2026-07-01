/**
 * SplashReadyBridge — tells the native Android splash overlay (MainActivity's
 * JsBridge.notifyContentReady, see gen/android's MainActivity.kt) that
 * there's real content to show.
 *
 * Firing this right after the very first React commit (as it originally
 * did, from main.tsx) dismissed the splash while AuthContext was still
 * resolving — i.e. before the app even knew whether to show sign-in or the
 * authenticated routes, so the splash disappeared onto whatever transient
 * state happened to be mounted first.
 *
 * Waiting for just `isLoading` to clear still wasn't enough — that only
 * means the auth check (a single fast keyring read) finished, not that
 * whatever page it routes to (Grid, Chat, ...) has actually loaded its own
 * data yet, so the splash was still handing off to a spinner/empty state.
 * `useIsFetching()` is a global, page-agnostic count of every React Query
 * fetch in flight anywhere in the app — waiting for it to settle at 0 means
 * whatever landing page mounted has actually finished loading its data,
 * without this needing to know anything about which page that is. The
 * settle delay guards against the brief gap between the auth-driven queries
 * finishing and the landing page's own queries starting.
 *
 * The bridge is only present in the Tauri Android WebView; on web/desktop/iOS
 * `window.FreeGrindBridge` is undefined and this is a no-op.
 */

import { useEffect } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useAuth } from "../contexts/useAuth";

const SETTLE_DELAY_MS = 500;

function signalContentReady(): void {
	(
		window as unknown as { FreeGrindBridge?: { notifyContentReady?: () => void } }
	).FreeGrindBridge?.notifyContentReady?.();
}

export function SplashReadyBridge() {
	const { isLoading } = useAuth();
	const fetchingCount = useIsFetching();

	useEffect(() => {
		if (isLoading || fetchingCount > 0) {
			return;
		}

		const settleTimeout = window.setTimeout(() => {
			// Double rAF: the first fires before the browser paints this
			// commit, the second only once it actually has.
			requestAnimationFrame(() => {
				requestAnimationFrame(signalContentReady);
			});
		}, SETTLE_DELAY_MS);

		return () => window.clearTimeout(settleTimeout);
	}, [isLoading, fetchingCount]);

	return null;
}
