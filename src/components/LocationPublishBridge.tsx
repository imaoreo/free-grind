import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/useAuth";
import { usePreferences } from "../contexts/PreferencesContext";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { appLog } from "../utils/logger";

export function LocationPublishBridge() {
	// The automatic profile PATCH has been disabled here to prevent race conditions
	// where the profile updates coordinates before the server updates the cascade session.
	// Coordinate/profile synchronization is now handled in GridPage.tsx after a successful
	// network cascade fetch.
	return null;
}
