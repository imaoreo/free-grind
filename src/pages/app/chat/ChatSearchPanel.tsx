import { Loader2, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/useAuth";
import * as chatDb from "../../../services/chatDb";
import type { ConversationEntry } from "../../../types/messages";
import type { IndexedMessage } from "../../../types/chat-cache";
import { appLog } from "../../../utils/logger";
import { ProfileImage } from "../../../components/ui/profile-image";
import { useAvatarCache } from "../../../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { getOtherParticipant, getParticipantAvatarUrl, formatConversationTime } from "./chatUtils";
import { searchMessagesLocal } from "./cache";
import { highlightMatch } from "./highlightMatch";

type Props = {
	isDesktop: boolean;
	searchQuery: string;
	onClose: () => void;
	// The desktop/mobile-aware navigation lives in ChatPage.tsx (on desktop it
	// sets the selected conversation state directly; a plain navigate() there
	// only updates the URL, which an already-open thread doesn't re-read) —
	// use that instead of duplicating a mobile-only version here.
	onOpenConversationById: (conversationId: string) => void;
};

// Searches message content only — the chat database covers this either way,
// so there's no separate "conversations" mode: matching a conversation's
// name/last message is just a degenerate case of matching its messages.
export function ChatSearchPanel({ isDesktop, searchQuery, onClose, onOpenConversationById }: Props) {
	const { userId } = useAuth();
	const { t } = useTranslation();
	useAvatarCache();

	const [conversations, setConversations] = useState<ConversationEntry[]>([]);
	const [isLoadingInbox, setIsLoadingInbox] = useState(true);
	const [inboxError, setInboxError] = useState<string | null>(null);

	const [dbMessageResults, setDbMessageResults] = useState<IndexedMessage[]>([]);

	useEffect(() => {
		if (searchQuery.trim().length < 2) {
			setDbMessageResults([]);
			return;
		}

		let active = true;
		const timeoutId = window.setTimeout(() => {
			void chatDb
				.searchMessages(searchQuery, { limit: 80 })
				.then((results) => {
					if (active) {
						setDbMessageResults(results);
					}
				})
				.catch((error) => {
					appLog.warn("[chat-search] db message search failed", error);
				});
		}, 200);

		return () => {
			active = false;
			window.clearTimeout(timeoutId);
		};
	}, [searchQuery]);

	const messageSearchResults = useMemo(() => {
		const merged = new Map<string, IndexedMessage>();
		for (const result of dbMessageResults) {
			merged.set(result.messageId, result);
		}
		// In-memory results last: they reflect the live thread, so they win
		// over a possibly-stale db row for the same message id (e.g. a message
		// edited/unsent locally moments ago, before the db write settles).
		for (const result of searchMessagesLocal(searchQuery, { limit: 80 })) {
			merged.set(result.messageId, result);
		}
		return [...merged.values()]
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 80);
	}, [searchQuery, dbMessageResults]);

	// Message search results only carry a flat text index (see cache.ts), not
	// the participant data needed to show a real avatar/name like the normal
	// chat list rows do — look that up from the already-loaded inbox entries
	// instead of showing a generic placeholder.
	const conversationsById = useMemo(() => {
		const map = new Map<string, ConversationEntry>();
		for (const entry of conversations) {
			map.set(entry.data.conversationId, entry);
		}
		return map;
	}, [conversations]);

	const getConversationAvatarMeta = useCallback(
		(conversationId: string) => {
			const entry = conversationsById.get(conversationId);
			const otherParticipant = entry ? getOtherParticipant(entry, userId) : null;
			const hash = otherParticipant?.primaryMediaHash;
			return {
				name: entry?.data.name || t("common.unknown_display_name"),
				avatarSrc: hash ? resolveAvatarSrc(hash, getParticipantAvatarUrl(hash)) : null,
			};
		},
		[conversationsById, userId, t],
	);

	// Read from the full local chatDb (every conversation ever synced, archived
	// or not), not just the first page of the live inbox — searchMessages
	// below searches that same full local history, so a match from an old or
	// archived conversation would otherwise have no avatar/name to show.
	useEffect(() => {
		let active = true;
		setIsLoadingInbox(true);
		setInboxError(null);
		void chatDb
			.listConversations({ includeArchived: true })
			.then((stored) => {
				if (active) setConversations(stored.map((c) => c.entry));
			})
			.catch((e) => {
				if (active) setInboxError(e instanceof Error ? e.message : t("chat_search.error_load_inbox"));
			})
			.finally(() => {
				if (active) setIsLoadingInbox(false);
			});
		return () => { active = false; };
	}, [t]);

	const openConversationById = useCallback(
		(conversationId: string) => {
			onClose();
			onOpenConversationById(conversationId);
		},
		[onOpenConversationById, onClose],
	);

	const highlight = (text: string, q: string) =>
		highlightMatch(text, q).map((part, i) =>
			part.match ? (
				<mark key={i} className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]">
					{part.text}
				</mark>
			) : (
				<span key={i}>{part.text}</span>
			),
		);

	const px = isDesktop ? "px-4" : "px-[var(--app-px)]";

	if (searchQuery.trim().length < 2) {
		return (
			<div className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-12 ${px} text-[var(--text-muted)]`}>
				<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
					<MessageCircle className="h-7 w-7 opacity-40" />
				</div>
				<p className="text-sm">{t("chat_search.min_chars")}</p>
			</div>
		);
	}

	if (isLoadingInbox) {
		return (
			<div className={`flex min-h-0 flex-1 items-center justify-center gap-2 py-12 text-sm text-[var(--text-muted)] ${px}`}>
				<Loader2 className="h-4 w-4 animate-spin" />
				{t("chat_search.loading")}
			</div>
		);
	}

	if (inboxError) {
		return (
			<p className={`py-12 text-center text-sm text-[var(--text-muted)] ${px}`}>{inboxError}</p>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
			<div className="flex flex-col">
				{/* Styled exactly like the real chat list rows (ChatConversationRow)
				    — same avatar size/shadow, spacing, and divider — but with the
				    matched message's own text as the preview (not necessarily the
				    conversation's last message) and its own timestamp. */}
				{messageSearchResults.map((result) => {
					const { name, avatarSrc } = getConversationAvatarMeta(result.conversationId);
					return (
						<button
							key={result.messageId}
							type="button"
							onClick={() => openConversationById(result.conversationId)}
							className="flex w-full items-center gap-4 border-b border-[var(--surface-2)] py-3 pl-4 pr-4 text-left transition hover:bg-[var(--surface-2)]"
						>
							<div className="h-14 w-14 shrink-0 squircle bg-[var(--surface-2)] drop-shadow-sm">
								<ProfileImage src={avatarSrc} alt={name} />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-sm font-semibold text-[var(--text)]">{name}</p>
									<span className="shrink-0 text-xs text-[var(--text-muted)]">
										{formatConversationTime(result.timestamp)}
									</span>
								</div>
								<p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">
									{highlight(result.text, searchQuery)}
								</p>
							</div>
						</button>
					);
				})}
				{messageSearchResults.length === 0 && (
					<div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
						<MessageCircle className="h-7 w-7 opacity-30" />
						<p className="text-sm">{t("chat_search.no_messages_found")}</p>
					</div>
				)}
			</div>
		</div>
	);
}
