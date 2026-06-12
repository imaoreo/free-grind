import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatFiltersPanel } from "./ChatFiltersPanel";
import { buildChatFiltersDraft, draftToFilters, type ChatFiltersDraft } from "./chatUtils";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import type { InboxFilters } from "../../../types/messages";

type Props = {
	isDesktop: boolean;
	draft: ChatFiltersDraft;
	onChangeDraft: (draft: ChatFiltersDraft) => void;
	onClose: () => void;
	onApply: (filters: InboxFilters) => void;
};

export function ChatFiltersOverlay({ isDesktop, draft, onChangeDraft, onClose, onApply }: Props) {
	const { t } = useTranslation();
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleClose = useCallback(() => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);

		if (window.history.state?.modal === "chat-filters") {
			window.history.back();
		}

		if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
		closeTimeoutRef.current = setTimeout(() => {
			closeTimeoutRef.current = null;
			onClose();
		}, 300);
	}, [onClose]);

	useEffect(() => {
		return () => {
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current);
				closeTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (window.history.state?.modal !== "chat-filters") {
			window.history.pushState({ modal: "chat-filters" }, "");
		}

		const handlePopState = (e: PopStateEvent) => {
			if (e.state?.modal !== "chat-filters") {
				handleClose();
			}
		};

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [handleClose]);

	const handleApply = () => {
		onApply(draftToFilters(draft));
		handleClose();
	};

	const handleClear = () => {
		onApply(draftToFilters(buildChatFiltersDraft({})));
		handleClose();
	};

	return (
		<div
			className={`fixed inset-0 z-[55] flex flex-col no-touch-callout isolate ${
				isClosing ? "pointer-events-none" : ""
			}`}
		>
			{/* Backdrop */}
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${
					isClosing ? "animate-backdrop-out" : "animate-backdrop-in"
				}`}
				onClick={handleClose}
			/>

			{/* Modal */}
			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-top-out" : "animate-modal-top-in"
				} md:border-x md:border-[var(--border)]`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative shrink-0 overflow-hidden px-[var(--app-px)] pb-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<PageHeaderBackground color="var(--accent)" />
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)]">
								<SlidersHorizontal className="h-5 w-5" />
							</div>
							<h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
								{t("right_now.filters")}
							</h2>
						</div>
						<button
							type="button"
							onClick={handleClose}
							className="shrink-0 rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
							aria-label={t("common.close")}
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</header>

				<div className="shrink-0 border-b border-[var(--border)]" />

				{/* Filter content */}
				<div className="relative z-10 flex-1 overflow-y-auto">
					<ChatFiltersPanel isDesktop={isDesktop} draft={draft} onChangeDraft={onChangeDraft} />
				</div>

				{/* Bottom actions */}
				<div
					className="relative z-10 shrink-0 border-t border-[var(--border)] px-[var(--app-px)] pt-3 flex gap-2"
					style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
				>
					<button
						type="button"
						onClick={handleClear}
						className="flex h-12 items-center gap-1.5 rounded-2xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
					>
						<RotateCcw className="h-4 w-4" />
						{t("browse_filters.clear_all")}
					</button>
					<button
						type="button"
						onClick={handleApply}
						className="group relative h-12 flex-1 overflow-hidden rounded-2xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-contrast)] transition hover:brightness-110 active:scale-[0.98]"
						style={{ boxShadow: "0 8px 20px -4px color-mix(in srgb, var(--accent), transparent 65%)" }}
					>
						<span className="relative z-10">{t("browse_filters.apply")}</span>
						<div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
					</button>
				</div>
			</div>
		</div>
	);
}
