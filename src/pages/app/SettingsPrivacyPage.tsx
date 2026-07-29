import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BarChart3, CheckCheck, Eye, EyeOff, Ghost, ImageOff, ToggleRight } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useSettingsHighlight } from "../../hooks/useSettingsHighlight";
import {
	getHideReadReceiptsGlobal,
	getIncognitoMode,
	getShowReadReceiptToggle,
	isRecordProfileViewsEnabled,
	setHideReadReceiptsGlobal,
	setIncognitoMode,
	setRecordProfileViewsEnabled,
	setShowReadReceiptToggle as persistShowReadReceiptToggle,
} from "../../utils/privacy";
import {
	readAnalyticsConsentChoice,
	writeAnalyticsConsentChoice,
	type AnalyticsConsentChoice,
} from "../../utils/analyticsConsent";

export function SettingsPrivacyPage() {
	const { t } = useTranslation();
	const highlightId = useSettingsHighlight();
	const { blurIncomingMedia, blurGridProfilePictures, showAlbumSensitiveContentWarning, setPreferences } = usePreferences();

	const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(() => !getHideReadReceiptsGlobal());
	const [showReadReceiptToggle, setShowReadReceiptToggle] = useState(() => getShowReadReceiptToggle());
	const [recordProfileViews, setRecordProfileViews] = useState(() => isRecordProfileViewsEnabled());
	const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsentChoice | null>(() => readAnalyticsConsentChoice());
	const [incognitoMode, setIncognitoModeState] = useState(() => getIncognitoMode());

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.privacy")}</h1>
				<p className="app-subtitle">{t("settings.privacy_desc")}</p>
			</header>

			<div className="grid gap-6">

				{/* Incognito Mode */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.grid_visibility")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							id="privacy-incognito-mode"
							highlighted={highlightId === "privacy-incognito-mode"}
							icon={<Ghost className="h-5 w-5" />}
							iconClass="bg-fuchsia-500/15 text-fuchsia-400"
							label={t("privacy.incognito_mode")}
							description={t("privacy.incognito_mode_desc")}
							checked={incognitoMode}
							onChange={(checked) => {
								setIncognitoModeState(checked);
								void setIncognitoMode(checked);
							}}
						/>
						<div className="px-4 py-3">
							<p className="text-xs text-[var(--text-muted)] leading-relaxed">
								{t("privacy.incognito_mode_note")}
							</p>
						</div>
					</div>
				</div>

				{/* Read Receipts */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.read_receipts")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							id="privacy-send-read-receipts"
							highlighted={highlightId === "privacy-send-read-receipts"}
							icon={<CheckCheck className="h-5 w-5" />}
							iconClass="bg-indigo-500/15 text-indigo-400"
							label={t("privacy.send_read_receipts")}
							description={t("privacy.send_read_receipts_desc")}
							checked={readReceiptsEnabled}
							onChange={(checked) => {
								setReadReceiptsEnabled(checked);
								void setHideReadReceiptsGlobal(!checked);
							}}
						/>
						<ToggleRow
							id="privacy-per-chat-overrides"
							highlighted={highlightId === "privacy-per-chat-overrides"}
							icon={<ToggleRight className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label={t("privacy.per_chat_overrides")}
							description={t("privacy.per_chat_overrides_desc")}
							checked={showReadReceiptToggle}
							onChange={(checked) => {
								setShowReadReceiptToggle(checked);
								void persistShowReadReceiptToggle(checked);
							}}
						/>
						<div className="px-4 py-3">
							<p className="text-xs text-[var(--text-muted)] leading-relaxed">
								{t("privacy.read_receipts_grid_unread_note", {
									defaultValue:
										"With read receipts off, there's no way to tell the server you've read a message — so a chat can still show up as unread on the Grid even after you've read or deleted it.",
								})}
							</p>
						</div>
					</div>
				</div>

				{/* Profile Views */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.profile_views")}</p>
					<div className="surface-card overflow-hidden">
						<ToggleRow
							id="privacy-record-profile-views"
							highlighted={highlightId === "privacy-record-profile-views"}
							icon={<Eye className="h-5 w-5" />}
							iconClass="bg-amber-500/15 text-amber-400"
							label={t("privacy.record_profile_views")}
							description={t("privacy.record_profile_views_desc")}
							checked={recordProfileViews}
							onChange={(checked) => {
								setRecordProfileViews(checked);
								void setRecordProfileViewsEnabled(checked);
							}}
						/>
					</div>
				</div>

				{/* NSFW Content */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.nsfw_content")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							id="privacy-blur-incoming-media"
							highlighted={highlightId === "privacy-blur-incoming-media"}
							icon={<ImageOff className="h-5 w-5" />}
							iconClass="bg-sky-500/15 text-sky-400"
							label={t("customizability.blur_incoming_media")}
							description={t("customizability.blur_incoming_media_description")}
							checked={blurIncomingMedia}
							onChange={(checked) => void setPreferences({ blurIncomingMedia: checked })}
						/>
						<ToggleRow
							id="privacy-blur-grid-profile-pictures"
							highlighted={highlightId === "privacy-blur-grid-profile-pictures"}
							icon={<EyeOff className="h-5 w-5" />}
							iconClass="bg-sky-500/15 text-sky-400"
							label={t("privacy.blur_grid_profile_pictures")}
							description={t("privacy.blur_grid_profile_pictures_desc")}
							checked={blurGridProfilePictures}
							onChange={(checked) => void setPreferences({ blurGridProfilePictures: checked })}
						/>
						<ToggleRow
							id="privacy-sensitive-warning"
							highlighted={highlightId === "privacy-sensitive-warning"}
							icon={<AlertTriangle className="h-5 w-5" />}
							iconClass="bg-orange-500/15 text-orange-400"
							label={t("privacy.show_sensitive_content_warning")}
							description={t("privacy.show_sensitive_content_warning_desc")}
							checked={showAlbumSensitiveContentWarning}
							onChange={(checked) => void setPreferences({ showAlbumSensitiveContentWarning: checked })}
						/>
					</div>
				</div>

				{/* Analytics & Discovery */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.analytics.title")}
					</p>
					<div className="surface-card overflow-hidden">
						<ToggleRow
							id="privacy-analytics"
							highlighted={highlightId === "privacy-analytics"}
							icon={<BarChart3 className="h-5 w-5" />}
							iconClass="bg-violet-500/15 text-violet-400"
							label={t("customizability.analytics.title")}
							description={t("customizability.analytics.description")}
							checked={analyticsConsent === "granted"}
							onChange={(checked) => {
								const choice: AnalyticsConsentChoice = checked ? "granted" : "denied";
								writeAnalyticsConsentChoice(choice);
								setAnalyticsConsent(choice);
							}}
						/>
						<div className="border-t border-[var(--border)] px-4 py-3">
							<p className="text-xs text-[var(--text-muted)] leading-relaxed">
								{t("customizability.analytics.note")}
							</p>
						</div>
					</div>
				</div>

			</div>
		</section>
	);
}
