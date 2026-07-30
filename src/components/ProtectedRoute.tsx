import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { LoadingScreen } from "./LoadingScreen";
import { RestoreBackupOffer } from "./RestoreBackupOffer";
import * as chatDb from "../services/chatDb";
import { hasOfferedRestore, markRestoreOffered } from "../utils/restoreOfferStorage";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { userId, isLoading, settingsReady } = useAuth();
	const [showRestoreOffer, setShowRestoreOffer] = useState(false);

	// Waits for settingsReady (i.e. setActiveChatDbUser has resolved and the
	// per-profile chat db file actually exists) before deciding — otherwise
	// the restore command could target the wrong/not-yet-selected db file.
	// Deliberately not blocking the isLoading/!userId checks below on this
	// too: that would add a new loading flash on every login that doesn't
	// exist today. This just swaps the offer in a moment after the real
	// route would've rendered, which is fine for a one-time-ever prompt.
	useEffect(() => {
		if (!settingsReady || userId == null || hasOfferedRestore(userId)) {
			return;
		}
		let cancelled = false;
		void (async () => {
			// An existing user who already has local data (just doesn't have
			// the "already offered" flag set yet, e.g. right after this
			// feature shipped) should never see this — it's only meant for a
			// genuinely fresh profile on this device.
			const hasData = await chatDb.hasAnyLocalChatData();
			if (cancelled) return;
			if (hasData) {
				markRestoreOffered(userId);
			} else {
				setShowRestoreOffer(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [settingsReady, userId]);

	if (isLoading) {
		return <LoadingScreen />;
	}

	if (!userId) {
		return <Navigate to="/auth/sign-in" replace />;
	}

	if (showRestoreOffer) {
		return <RestoreBackupOffer userId={userId} onDone={() => setShowRestoreOffer(false)} />;
	}

	return children;
}
