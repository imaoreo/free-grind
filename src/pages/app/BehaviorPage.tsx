import { useState } from "react";
import { Ban, ShieldOff, Trash2 } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import {
	SKIP_BLOCK_CONFIRM_KEY,
	SKIP_UNBLOCK_CONFIRM_KEY,
	SKIP_DELETE_CONVERSATION_CONFIRM_KEY,
	isBlockConfirmSkipped,
	isUnblockConfirmSkipped,
	isDeleteConversationConfirmSkipped,
} from "../../utils/blockConfirm";

export function BehaviorPage() {
	const { t } = useTranslation();
	const [confirmBeforeBlock, setConfirmBeforeBlock] = useState(() => !isBlockConfirmSkipped());
	const [confirmBeforeUnblock, setConfirmBeforeUnblock] = useState(() => !isUnblockConfirmSkipped());
	const [confirmBeforeDeleteConversation, setConfirmBeforeDeleteConversation] = useState(
		() => !isDeleteConversationConfirmSkipped(),
	);

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
						icon={<ShieldOff className="h-5 w-5" />}
						iconClass="bg-red-500/15 text-red-400"
						label={t("customizability.confirm_before_unblock")}
						description={t("customizability.confirm_before_unblock_desc")}
						checked={confirmBeforeUnblock}
						onChange={(checked) => {
							setConfirmBeforeUnblock(checked);
							window.localStorage.setItem(SKIP_UNBLOCK_CONFIRM_KEY, String(!checked));
						}}
					/>
					<ToggleRow
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
				</div>
			</div>
		</section>
	);
}
