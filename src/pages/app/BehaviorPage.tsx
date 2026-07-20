import { useState } from "react";
import { ArrowDownWideNarrow, Ban, ExternalLink, Images, LayoutGrid, Timer, Trash2 } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { Chip } from "../../components/ui/chip";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useSettingsHighlight } from "../../hooks/useSettingsHighlight";
import {
	SKIP_BLOCK_CONFIRM_KEY,
	SKIP_DELETE_CONVERSATION_CONFIRM_KEY,
	SKIP_LINK_OPEN_CONFIRM_KEY,
	isBlockConfirmSkipped,
	isDeleteConversationConfirmSkipped,
	isLinkOpenConfirmSkipped,
} from "../../utils/blockConfirm";

const ALBUM_EXPIRATION_OPTIONS = ["INDEFINITE", "ONCE", "TEN_MINUTES", "ONE_HOUR", "ONE_DAY"] as const;

export function BehaviorPage() {
	const { t } = useTranslation();
	const highlightId = useSettingsHighlight();
	const {
		defaultExpiringPhotos,
		defaultAlbumExpirationType,
		openAlbumAsBottomSheet,
		sortDrawerMediaByFrequency,
		setPreferences,
	} = usePreferences();
	const albumExpirationLabels: Record<(typeof ALBUM_EXPIRATION_OPTIONS)[number], string> = {
		INDEFINITE: t("chat_drawer.expiry.unlimited", { defaultValue: "Unlimited" }),
		ONCE: t("chat_drawer.expiry.once", { defaultValue: "Once" }),
		TEN_MINUTES: t("chat_drawer.expiry.ten_minutes", { defaultValue: "10 minutes" }),
		ONE_HOUR: t("chat_drawer.expiry.one_hour", { defaultValue: "1 hour" }),
		ONE_DAY: t("chat_drawer.expiry.one_day", { defaultValue: "1 day" }),
	};
	const [confirmBeforeBlock, setConfirmBeforeBlock] = useState(() => !isBlockConfirmSkipped());
	const [confirmBeforeDeleteConversation, setConfirmBeforeDeleteConversation] = useState(
		() => !isDeleteConversationConfirmSkipped(),
	);
	const [confirmBeforeOpenLink, setConfirmBeforeOpenLink] = useState(() => !isLinkOpenConfirmSkipped());

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.behavior")}</h1>
				<p className="app-subtitle">{t("behavior.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
					<ToggleRow
						id="behavior-confirm-block"
						highlighted={highlightId === "behavior-confirm-block"}
						icon={<Ban className="h-5 w-5" />}
						iconClass="bg-red-500/15 text-red-400"
						label={t("customizability.confirm_before_block")}
						description={t("customizability.confirm_before_block_desc")}
						checked={confirmBeforeBlock}
						onChange={(checked) => {
							setConfirmBeforeBlock(checked);
							window.localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, String(!checked));
						}}
					/>
					<ToggleRow
						id="behavior-confirm-delete-conversation"
						highlighted={highlightId === "behavior-confirm-delete-conversation"}
						icon={<Trash2 className="h-5 w-5" />}
						iconClass="bg-red-500/15 text-red-400"
						label={t("customizability.confirm_before_delete_conversation")}
						description={t("customizability.confirm_before_delete_conversation_desc")}
						checked={confirmBeforeDeleteConversation}
						onChange={(checked) => {
							setConfirmBeforeDeleteConversation(checked);
							window.localStorage.setItem(SKIP_DELETE_CONVERSATION_CONFIRM_KEY, String(!checked));
						}}
					/>
					<ToggleRow
						id="behavior-confirm-open-link"
						highlighted={highlightId === "behavior-confirm-open-link"}
						icon={<ExternalLink className="h-5 w-5" />}
						iconClass="bg-red-500/15 text-red-400"
						label={t("customizability.confirm_before_open_link", { defaultValue: "Ask before opening links" })}
						description={t("customizability.confirm_before_open_link_desc", {
							defaultValue: "Show a confirmation before opening a link tapped inside a chat message.",
						})}
						checked={confirmBeforeOpenLink}
						onChange={(checked) => {
							setConfirmBeforeOpenLink(checked);
							window.localStorage.setItem(SKIP_LINK_OPEN_CONFIRM_KEY, String(!checked));
						}}
					/>
				</div>

				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("behavior.disappearing_media")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							id="behavior-default-expiring-photos"
							highlighted={highlightId === "behavior-default-expiring-photos"}
							icon={<Timer className="h-5 w-5" />}
							iconClass="bg-violet-500/15 text-violet-400"
							label={t("behavior.default_expiring_photos")}
							description={t("behavior.default_expiring_photos_desc")}
							checked={defaultExpiringPhotos}
							onChange={(checked) => void setPreferences({ defaultExpiringPhotos: checked })}
						/>
						<div
							id="behavior-default-album-expiration"
							className={`flex items-start gap-3 px-4 py-3.5 ${highlightId === "behavior-default-album-expiration" ? "animate-settings-highlight" : ""}`}
						>
							<div className="rounded-2xl p-2.5 shrink-0 bg-violet-500/15 text-violet-400">
								<Images className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold">{t("behavior.default_album_expiration")}</p>
								<p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("behavior.default_album_expiration_desc")}</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{ALBUM_EXPIRATION_OPTIONS.map((option) => (
										<Chip
											key={option}
											selected={defaultAlbumExpirationType === option}
											onClick={() => void setPreferences({ defaultAlbumExpirationType: option })}
										>
											{albumExpirationLabels[option]}
										</Chip>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>

				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("behavior.album_viewing")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							id="behavior-open-album-as-bottom-sheet"
							highlighted={highlightId === "behavior-open-album-as-bottom-sheet"}
							icon={<LayoutGrid className="h-5 w-5" />}
							iconClass="bg-violet-500/15 text-violet-400"
							label={t("behavior.open_album_as_bottom_sheet")}
							description={t("behavior.open_album_as_bottom_sheet_desc")}
							checked={openAlbumAsBottomSheet}
							onChange={(checked) => void setPreferences({ openAlbumAsBottomSheet: checked })}
						/>
					</div>
				</div>

				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("behavior.media_drawer")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							id="behavior-sort-drawer-media-by-frequency"
							highlighted={highlightId === "behavior-sort-drawer-media-by-frequency"}
							icon={<ArrowDownWideNarrow className="h-5 w-5" />}
							iconClass="bg-violet-500/15 text-violet-400"
							label={t("behavior.sort_drawer_media_by_frequency")}
							description={t("behavior.sort_drawer_media_by_frequency_desc")}
							checked={sortDrawerMediaByFrequency}
							onChange={(checked) => void setPreferences({ sortDrawerMediaByFrequency: checked })}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
