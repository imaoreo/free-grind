import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	readAnalyticsConsentChoice,
	writeAnalyticsConsentChoice,
	type AnalyticsConsentChoice,
} from "../../utils/analyticsConsent";

export function SettingsPrivacyPage() {
	const { t } = useTranslation();
	const { blurIncomingMedia, setPreferences } = usePreferences();

	const [ghostMode, setGhostMode] = useState(() => window.localStorage.getItem("fg-ghost-mode") === "true");
	const [showGhostButton, setShowGhostButton] = useState(() => window.localStorage.getItem("fg-show-ghost-btn") !== "false");
	const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsentChoice | null>(() => readAnalyticsConsentChoice());

	return (
		<section className="app-screen">
			<header className="mb-6">
				<BackToSettings />
				<h1 className="app-title mb-2">{t("settings.privacy")}</h1>
				<p className="app-subtitle">{t("settings.privacy_desc")}</p>
			</header>

			<div className="grid gap-8">
				{/* Privacy */}
				<div>
					<p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						Privacy
					</p>
					<div className="surface-card divide-y divide-[var(--border)]">
						<div className="p-4 sm:p-5">
							<ToggleRow
								checked={ghostMode}
								onChange={(checked) => {
									setGhostMode(checked);
									window.localStorage.setItem("fg-ghost-mode", String(checked));
								}}
								label="Global Ghost Mode"
								description="Hide read receipts for all chats. The other person won't know you read their message until you reply or turn Ghost Mode off."
							/>
						</div>
						<div className="p-4 sm:p-5">
							<ToggleRow
								checked={showGhostButton}
								onChange={(checked) => {
									setShowGhostButton(checked);
									window.localStorage.setItem("fg-show-ghost-btn", String(checked));
								}}
								label="Per-Chat Overrides (Eye Button)"
								description="Show a button in the chat header to override the global setting for specific chats. Ghosted chats are highlighted in your Inbox."
							/>
						</div>
						<div className="p-4 sm:p-5">
							<ToggleRow
								checked={blurIncomingMedia}
								onChange={(checked) => void setPreferences({ blurIncomingMedia: checked })}
								label={t("customizability.blur_incoming_media")}
								description={t("customizability.blur_incoming_media_description")}
							/>
						</div>
					</div>
				</div>

				{/* Analytics & Discovery */}
				<div>
					<p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.analytics.title")}
					</p>
					<div className="surface-card p-4 sm:p-5">
						<ToggleRow
							checked={analyticsConsent === "granted"}
							onChange={(checked) => {
								const choice: AnalyticsConsentChoice = checked ? "granted" : "denied";
								writeAnalyticsConsentChoice(choice);
								setAnalyticsConsent(choice);
							}}
							label={t("customizability.analytics.title")}
							description={t("customizability.analytics.description")}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
