import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Eye, EyeOff, Ghost, ImageOff } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	readAnalyticsConsentChoice,
	writeAnalyticsConsentChoice,
	type AnalyticsConsentChoice,
} from "../../utils/analyticsConsent";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="peer sr-only"
			/>
			<span className="absolute inset-0 rounded-full border border-[var(--border)] bg-[var(--surface)] transition-colors peer-checked:border-transparent peer-checked:bg-[var(--accent)]" />
			<span className="absolute left-1 h-5 w-5 rounded-full bg-[var(--text)] transition-transform peer-checked:translate-x-5 peer-checked:bg-[var(--accent-contrast)]" />
		</span>
	);
}

function ToggleRow({
	icon,
	iconClass,
	label,
	description,
	checked,
	onChange,
}: {
	icon: React.ReactNode;
	iconClass: string;
	label: string;
	description?: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-2)]">
			<div className={`rounded-2xl p-2.5 shrink-0 ${iconClass}`}>{icon}</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold leading-snug">{label}</p>
				{description && (
					<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>
				)}
			</div>
			<Toggle checked={checked} onChange={onChange} />
		</label>
	);
}

export function SettingsPrivacyPage() {
	const { t } = useTranslation();
	const { blurIncomingMedia, setPreferences } = usePreferences();

	const [ghostMode, setGhostMode] = useState(() => window.localStorage.getItem("fg-ghost-mode") === "true");
	const [showGhostButton, setShowGhostButton] = useState(() => window.localStorage.getItem("fg-show-ghost-btn") !== "false");
	const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsentChoice | null>(() => readAnalyticsConsentChoice());

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.privacy")}</h1>
				<p className="app-subtitle">{t("settings.privacy_desc")}</p>
			</header>

			<div className="grid gap-6">

				{/* Ghost Mode */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.ghost_mode")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<Ghost className="h-5 w-5" />}
							iconClass="bg-indigo-500/15 text-indigo-400"
							label={t("privacy.global_ghost_mode")}
							description={t("privacy.global_ghost_mode_desc")}
							checked={ghostMode}
							onChange={(checked) => {
								setGhostMode(checked);
								window.localStorage.setItem("fg-ghost-mode", String(checked));
							}}
						/>
						<ToggleRow
							icon={<Eye className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label={t("privacy.per_chat_overrides")}
							description={t("privacy.per_chat_overrides_desc")}
							checked={showGhostButton}
							onChange={(checked) => {
								setShowGhostButton(checked);
								window.localStorage.setItem("fg-show-ghost-btn", String(checked));
							}}
						/>
					</div>
				</div>

				{/* NSFW Content */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.nsfw_content")}</p>
					<div className="surface-card overflow-hidden">
						<ToggleRow
							icon={<ImageOff className="h-5 w-5" />}
							iconClass="bg-sky-500/15 text-sky-400"
							label={t("customizability.blur_incoming_media")}
							description={t("customizability.blur_incoming_media_description")}
							checked={blurIncomingMedia}
							onChange={(checked) => void setPreferences({ blurIncomingMedia: checked })}
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
