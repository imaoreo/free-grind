export function getLocalProfileId(): string {
	if (typeof window === "undefined") {
		return "default";
	}
	let profileId = localStorage.getItem("fg_profile_id");
	if (!profileId) {
		// Generate a random unique profile identifier for this isolated WebView2 instance
		profileId = "profile_" + Math.random().toString(36).substring(2, 15);
		localStorage.setItem("fg_profile_id", profileId);
	}
	return profileId;
}
