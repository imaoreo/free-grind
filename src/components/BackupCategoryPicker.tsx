import { useTranslation } from "react-i18next";
import { ToggleRow } from "./ui/toggle-row";
import type { BackupCategoryId } from "../services/backupRestore";

function useBackupCategoryLabels(): Record<BackupCategoryId, string> {
	const { t } = useTranslation();
	return {
		chat_messages: t("data_backup.category_chat_messages", { defaultValue: "Chat messages" }),
		media_albums: t("data_backup.category_media_albums", { defaultValue: "Media & albums" }),
		saved_phrases: t("data_backup.category_saved_phrases", { defaultValue: "Saved phrases" }),
		saved_locations: t("data_backup.category_saved_locations", { defaultValue: "Saved locations" }),
		settings: t("data_backup.category_settings", { defaultValue: "Settings" }),
		sexual_health: t("data_backup.category_sexual_health", { defaultValue: "Sexual health" }),
	};
}

export function BackupCategoryPicker({
	categories,
	selected,
	onToggle,
}: {
	/** Which category ids to render as toggle rows, in order — the full list for export, only what's present in the picked file for import. */
	categories: BackupCategoryId[];
	selected: Set<BackupCategoryId>;
	onToggle: (id: BackupCategoryId) => void;
}) {
	const labels = useBackupCategoryLabels();

	return (
		<div className="divide-y divide-[var(--border)]">
			{categories.map((id) => (
				<ToggleRow
					key={id}
					dense
					label={labels[id]}
					checked={selected.has(id)}
					onChange={() => onToggle(id)}
				/>
			))}
		</div>
	);
}
