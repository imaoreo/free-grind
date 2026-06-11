import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type InboxAlbumsTabsProps = {
	activeTab: "inbox" | "albums";
	onInboxClick: () => void;
	onAlbumsClick: () => void;
	trailing?: ReactNode;
	inboxDotColor?: string;
};

export function InboxAlbumsTabs({
	activeTab,
	onInboxClick,
	onAlbumsClick,
	trailing,
	inboxDotColor,
}: InboxAlbumsTabsProps) {
	const { t } = useTranslation();

	return (
		<div className="flex items-center gap-3">
			<button
				type="button"
				onClick={onInboxClick}
				className={
					activeTab === "inbox"
						? "relative inline-flex items-end text-left"
						: "relative inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
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
				{inboxDotColor && (
					<span
						className="absolute -top-0.5 -right-2 h-2 w-2 rounded-full transition-colors duration-500"
						style={{ backgroundColor: inboxDotColor }}
					/>
				)}
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
