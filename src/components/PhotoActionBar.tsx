import { useState } from "react";
import { Flame, Loader2, SendHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

type PhotoActionBarProps = {
	onSendText: (text: string) => void | Promise<void>;
	/** Omit to hide the reaction button entirely (e.g. profile photo replies, which have no reaction). */
	onReact?: () => void | Promise<void>;
	placeholder?: string;
};

/**
 * Bottom bar for replying to (or 🔥-reacting to) a specific photo shown in
 * PhotoViewer — mirrors the floating "quick message + tap" footer in
 * ProfileDetailsModal, but scoped to a single reaction (no emoji picker,
 * since album-photo reactions only ever imply 🔥). Circular glass buttons
 * match PhotoViewer's own close/save/nav chrome so the whole overlay reads
 * as one consistent control language.
 */
export function PhotoActionBar({ onSendText, onReact, placeholder }: PhotoActionBarProps) {
	const { t } = useTranslation();
	const [text, setText] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [isReacting, setIsReacting] = useState(false);

	const handleSend = async () => {
		const trimmed = text.trim();
		if (!trimmed || isSending) return;
		setIsSending(true);
		try {
			await onSendText(trimmed);
			setText("");
		} finally {
			setIsSending(false);
		}
	};

	const handleReact = async () => {
		if (!onReact || isReacting) return;
		setIsReacting(true);
		try {
			await onReact();
		} finally {
			setIsReacting(false);
		}
	};

	return (
		<div
			className="px-3"
			style={{
				paddingTop: "3.5rem",
				paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 1rem)",
				background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)",
			}}
		>
			<div className="mx-auto flex w-full max-w-lg items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<div
						className="pointer-events-none absolute inset-0 rounded-xl backdrop-blur-md"
						style={{
							background: "rgba(0,0,0,0.4)",
							border: "1px solid rgba(255,255,255,0.15)",
						}}
					/>
					<input
						type="text"
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void handleSend();
							}
						}}
						disabled={isSending}
						placeholder={placeholder ?? t("photo_viewer.reply_placeholder", { defaultValue: "Reply…" })}
						className="relative h-11 w-full rounded-xl bg-transparent px-4 text-sm text-white placeholder:text-white/55 outline-none disabled:opacity-50"
					/>
				</div>
				<button
					type="button"
					onClick={() => void handleSend()}
					disabled={isSending || text.trim().length === 0}
					aria-label={t("photo_viewer.send", { defaultValue: "Send" })}
					className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-white transition active:scale-90 disabled:opacity-40"
				>
					{isSending ? (
						<Loader2 className="h-5 w-5 animate-spin" />
					) : (
						<SendHorizontal className="h-5 w-5 text-[var(--accent)]" />
					)}
				</button>
				{onReact && (
					<button
						type="button"
						onClick={() => void handleReact()}
						disabled={isReacting}
						aria-label={t("photo_viewer.react", { defaultValue: "React" })}
						className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-white transition active:scale-90 disabled:opacity-50"
					>
						{isReacting ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : (
							<Flame
								className="h-5 w-5 text-orange-400"
								style={{ filter: "drop-shadow(0 0 4px rgba(255,140,0,0.75))" }}
							/>
						)}
					</button>
				)}
			</div>
		</div>
	);
}
