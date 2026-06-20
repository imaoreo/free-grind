import { useEffect, useState } from "react";
import { ChevronLeft, Download, ImageOff, Lock, VideoOff } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/useAuth";
import * as chatLog from "../../services/chatLog";
import { blockedMeStore, type BlockedMeRecord } from "../../services/blockedMeStore";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";
import { getMessageImageUrl, getMessageText, getMessageVideoUrl, formatDateTime24 } from "./chat/chatUtils";
import type { Message } from "../../types/messages";
import { cn } from "../../utils/cn";
import { shareOrDownloadJson } from "../../utils/exportFile";

export function BlockedMeConversationPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { userId } = useAuth();
	const { profileId } = useParams<{ profileId: string }>();

	const [record, setRecord] = useState<BlockedMeRecord | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!profileId) return;
		let cancelled = false;

		void (async () => {
			const all = await blockedMeStore.getAll();
			const found = all.find((r) => r.profileId === profileId) ?? null;
			if (cancelled) return;
			setRecord(found);

			if (found) {
				const log = await chatLog.readLog(found.conversationId);
				if (!cancelled) {
					setMessages([...log.messages].sort((a, b) => a.timestamp - b.timestamp));
				}
			}
			if (!cancelled) setIsLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [profileId]);

	const avatarUrl =
		record?.avatarHash && validateMediaHash(record.avatarHash)
			? getThumbImageUrl(record.avatarHash, "75x75")
			: null;

	const handleExport = async () => {
		if (!record) return;
		try {
			await shareOrDownloadJson(`free-grind-blocked-${record.displayName}-${record.profileId}.json`, messages);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to export chat.");
		}
	};

	return (
		<div className="app-screen flex flex-col">
			<header className="mb-4 flex items-center justify-between gap-3">
				<button
					type="button"
					onClick={() => navigate("/chat/blocked-me")}
					className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
				>
					<ChevronLeft className="h-4 w-4" />
					{t("common.back", { defaultValue: "Back" })}
				</button>
				{record && messages.length > 0 && (
					<button
						type="button"
						onClick={() => void handleExport()}
						className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--text)]"
					>
						<Download className="h-3.5 w-3.5" />
						{t("chat.blocked_me.export_chat", { defaultValue: "Export chat" })}
					</button>
				)}
			</header>

			{record && (
				<div className="mb-4 flex items-center gap-3">
					<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
						<ProfileImage src={avatarUrl} alt={t("profile_details.photo_alt", { name: record.displayName })} />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-semibold">{record.displayName}</p>
						<p className="text-xs text-[var(--text-muted)]">
							{t("chat.blocked_me.read_only_banner", {
								defaultValue: "This person blocked you, sorry! Showing your local chat history, you can't send new messages.",
							})}
						</p>
					</div>
				</div>
			)}

			<div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-6">
				{isLoading ? (
					<div className="flex justify-center py-10 text-sm text-[var(--text-muted)]">
						{t("common.loading", { defaultValue: "Loading…" })}
					</div>
				) : messages.length === 0 ? (
					<div className="flex justify-center py-10 text-sm text-[var(--text-muted)]">
						{t("chat.blocked_me.no_local_history", { defaultValue: "No local message history found for this conversation." })}
					</div>
				) : (
					messages.map((message) => {
						const isOwn = userId != null && message.senderId === userId;
						const imageUrl = getMessageImageUrl({ ...message, _localOnly: true });
						const videoUrl = getMessageVideoUrl({ ...message, _localOnly: true });
						return (
							<div
								key={message.messageId}
								className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}
							>
								<div
									className={cn(
										"max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
										isOwn
											? "bg-[var(--accent)] text-[var(--accent-contrast)]"
											: "bg-[var(--surface-2)] text-[var(--text)]",
									)}
								>
									{imageUrl ? (
										<img src={imageUrl} alt="" className="max-h-64 rounded-lg object-cover" />
									) : videoUrl ? (
										<div className="flex items-center gap-1.5 text-xs opacity-80">
											<VideoOff className="h-3.5 w-3.5" />
											{t("chat.thread.video_placeholder")}
										</div>
									) : message.type === "Image" || message.type === "ExpiringImage" ? (
										<div className="flex items-center gap-1.5 text-xs opacity-80">
											<ImageOff className="h-3.5 w-3.5" />
											{t("chat.thread.image_placeholder")}
										</div>
									) : (
										<span>{getMessageText({ ...message, _localOnly: true }, t)}</span>
									)}
								</div>
								<span className="px-1 text-[10px] text-[var(--text-muted)]">
									{formatDateTime24(message.timestamp)}
								</span>
							</div>
						);
					})
				)}
			</div>

			<div className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
				<Lock className="h-3.5 w-3.5" />
				{t("chat.blocked_me.locked_thread", { defaultValue: "This conversation is no longer available, read only." })}
			</div>
		</div>
	);
}
