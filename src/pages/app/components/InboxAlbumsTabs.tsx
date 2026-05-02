import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type InboxAlbumsTabsProps = {
	activeTab: "inbox" | "albums";
	onInboxClick: () => void;
	onAlbumsClick: () => void;
	trailing?: ReactNode;
};

export function InboxAlbumsTabs({
	activeTab,
	onInboxClick,
	onAlbumsClick,
	trailing,
}: InboxAlbumsTabsProps) {
	const { t } = useTranslation();

	return (
		<div className="flex min-h-10 items-end gap-3">
			<button
				type="button"
				onClick={onInboxClick}
				className={
					activeTab === "inbox"
						? "inline-flex items-end text-left"
						: "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
				}
				aria-current={activeTab === "inbox" ? "page" : undefined}
			>
				<span
					className={
						activeTab === "inbox"
							? "text-2xl font-bold leading-none sm:text-3xl"
							: "text-lg font-semibold leading-none sm:text-xl"
					}
				>
					{t("chat.tabs.inbox")}
				</span>
			</button>
			<button
				type="button"
				onClick={onAlbumsClick}
				className={
					activeTab === "albums"
						? "inline-flex items-end text-left"
						: "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
				}
				aria-current={activeTab === "albums" ? "page" : undefined}
			>
				<span
					className={
						activeTab === "albums"
							? "text-2xl font-bold leading-none sm:text-3xl"
							: "text-lg font-semibold leading-none sm:text-xl"
					}
				>
					{t("chat.tabs.albums")}
				</span>
			</button>
			{trailing}
		</div>
	);
}
