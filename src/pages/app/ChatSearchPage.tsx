import { ArrowRight, ChevronLeft, Loader2, MessageCircle, Search, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { usePreferences } from "../../contexts/PreferencesContext";
import type { ConversationEntry } from "../../types/messages";
import type { ProfileSearchResult, SearchMode } from "../../types/chat-page";
import { getProfileImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";
import { formatDistance } from "./gridpage/utils";
import {
	indexConversations,
	searchConversationsLocal,
	searchMessagesLocal,
} from "./chat/cache";
import { highlightMatch } from "./chat/highlightMatch";

export function ChatSearchPage() {
	const navigate = useNavigate();
	const service = useApiFunctions();
	const { geohash, unitsPreset } = usePreferences();
	const { t } = useTranslation();

	const [searchQuery, setSearchQuery] = useState("");
	const [startChatProfileIdDraft, setStartChatProfileIdDraft] = useState("");
	const [searchMode, setSearchMode] = useState<SearchMode>("messages");
	const [conversations, setConversations] = useState<ConversationEntry[]>([]);
	const [isLoadingInbox, setIsLoadingInbox] = useState(true);
	const [inboxError, setInboxError] = useState<string | null>(null);
	const [profileResults, setProfileResults] = useState<ProfileSearchResult[]>([]);
	const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);
	const [profileSearchAfterDistance, setProfileSearchAfterDistance] = useState<string | null>(null);
	const [profileSearchAfterProfileId, setProfileSearchAfterProfileId] = useState<string | null>(null);

	const searchedProfileId = useMemo(() => {
		const parsed = Number(searchQuery.trim());
		if (!Number.isInteger(parsed) || parsed <= 0) {
			return null;
		}
		return parsed;
	}, [searchQuery]);

	const conversationSearchResults = useMemo(
		() => searchConversationsLocal(searchQuery, 30),
		[searchQuery],
	);

	const messageSearchResults = useMemo(
		() => searchMessagesLocal(searchQuery, { limit: 80 }),
		[searchQuery],
	);

	const getSearchProfileImage = useCallback((hash: string | null | undefined) => {
		if (!hash || !validateMediaHash(hash)) {
			return null;
		}

		return getProfileImageUrl(hash);
	}, []);

	useEffect(() => {
		indexConversations(conversations);
	}, [conversations]);

	useEffect(() => {
		let active = true;
		setIsLoadingInbox(true);
		setInboxError(null);
		void service
			.listConversations({ page: 1, filters: undefined })
			.then((response) => {
				if (!active) {
					return;
				}
				setConversations(response.entries);
			})
			.catch((error) => {
				if (!active) {
					return;
				}
				setInboxError(error instanceof Error ? error.message : t("chat_search.error_load_inbox"));
			})
			.finally(() => {
				if (active) {
					setIsLoadingInbox(false);
				}
			});

		return () => {
			active = false;
		};
	}, [service]);

	const runProfileSearch = useCallback(
		async ({ loadMore }: { loadMore: boolean }) => {
			if (!geohash || searchQuery.trim().length < 2) {
				if (!loadMore) {
					setProfileResults([]);
					setProfileSearchAfterDistance(null);
					setProfileSearchAfterProfileId(null);
				}
				return;
			}

			setIsSearchingProfiles(true);
			try {
				const response = await service.searchProfiles({
					nearbyGeoHash: geohash,
					searchAfterDistance: loadMore
						? (profileSearchAfterDistance ?? undefined)
						: undefined,
					searchAfterProfileId: loadMore
						? (profileSearchAfterProfileId ?? undefined)
						: undefined,
				});

				const needle = searchQuery.trim().toLowerCase();
				const filtered = response.profiles.filter((profile) =>
					profile.displayName.toLowerCase().includes(needle),
				);

				setProfileResults((previous) => {
					const merged = loadMore ? [...previous, ...filtered] : filtered;
					const map = new Map<number, ProfileSearchResult>();
					for (const profile of merged) {
						map.set(profile.profileId, profile);
					}
					return [...map.values()];
				});

				setProfileSearchAfterDistance(
					response.lastDistanceInKm != null ? String(response.lastDistanceInKm) : null,
				);
				setProfileSearchAfterProfileId(
					response.lastProfileId != null ? String(response.lastProfileId) : null,
				);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("chat_search.error_search_profiles"),
				);
			} finally {
				setIsSearchingProfiles(false);
			}
		},
		[
			geohash,
			profileSearchAfterDistance,
			profileSearchAfterProfileId,
			searchQuery,
			service,
		],
	);

	useEffect(() => {
		if (searchMode !== "profiles") {
			return;
		}

		if (searchQuery.trim().length < 2) {
			setProfileResults([]);
			setProfileSearchAfterDistance(null);
			setProfileSearchAfterProfileId(null);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void runProfileSearch({ loadMore: false });
		}, 280);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [runProfileSearch, searchMode, searchQuery]);

	const startChatByProfileId = useCallback(
		(rawProfileId: string) => {
			const parsed = Number(rawProfileId.trim());
			if (!Number.isInteger(parsed) || parsed <= 0) {
				toast.error(t("chat_search.error_valid_id"));
				return;
			}

			const nextParams = new URLSearchParams();
			nextParams.set("targetProfileId", String(parsed));
			navigate(`/chat?${nextParams.toString()}`);
			setStartChatProfileIdDraft("");
		},
		[navigate],
	);

	const viewProfileById = useCallback(
		(rawProfileId: string) => {
			const parsed = Number(rawProfileId.trim());
			if (!Number.isInteger(parsed) || parsed <= 0) {
				toast.error(t("chat_search.error_valid_id"));
				return;
			}

			navigate(`/profile/${parsed}`);
			setStartChatProfileIdDraft("");
		},
		[navigate],
	);

	const openConversationById = useCallback(
		(conversationId: string) => {
			navigate(`/chat/${encodeURIComponent(conversationId)}`);
		},
		[navigate],
	);

	const openMessageSearchResult = useCallback(
		(result: { conversationId: string }) => {
			openConversationById(result.conversationId);
		},
		[openConversationById],
	);

	const highlight = (text: string, query: string) =>
		highlightMatch(text, query).map((part, i) =>
			part.match ? (
				<mark key={i} className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]">
					{part.text}
				</mark>
			) : (
				<span key={i}>{part.text}</span>
			),
		);

	const modes = ["messages", "conversations", "profiles"] as const;

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">

				{/* ── Header ── */}
				<header className="mb-4 flex items-center gap-2">
					<div className="inline-flex items-center gap-2">
						<button
							type="button"
							onClick={() => navigate("/chat")}
							className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
							aria-label={t("chat_search.back_to_inbox")}
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<div>
							<h1 className="app-title">{t("chat_search.title")}</h1>
							<p className="app-subtitle">{t("chat_search.subtitle")}</p>
						</div>
					</div>
				</header>

				{/* ── Search card ── */}
				<div className="surface-card space-y-4 p-4 sm:p-5">

					{/* Search input */}
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
						<input
							autoFocus
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={t("chat_search.placeholder")}
							className="input-field pl-9"
						/>
					</div>

					{/* Mode */}
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							{t("chat_search.mode_label")}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{modes.map((mode) => (
								<button
									key={mode}
									type="button"
									onClick={() => setSearchMode(mode)}
									className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
										searchMode === mode
											? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
											: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
									}`}
								>
									{t(`chat_search.modes.${mode}`)}
								</button>
							))}
						</div>
					</div>

					{/* Quick-start by profile ID */}
					<div className="border-t border-[var(--border)] pt-4">
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							{t("chat_search.quick_start_label")}
						</p>
						<form
							onSubmit={(e) => { e.preventDefault(); startChatByProfileId(startChatProfileIdDraft); }}
							className="mt-2 flex items-center gap-2"
						>
							<input
								type="text"
								inputMode="numeric"
								value={startChatProfileIdDraft}
								onChange={(e) => setStartChatProfileIdDraft(e.target.value)}
								placeholder={t("chat_search.quick_start_placeholder")}
								className="input-field h-9 min-w-0 flex-1 text-sm"
							/>
							<button
								type="button"
								onClick={() => viewProfileById(startChatProfileIdDraft)}
								className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								{t("chat_search.view")}
							</button>
							<button
								type="submit"
								className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								{t("chat_search.message")}
							</button>
						</form>
					</div>
				</div>

				{/* ── Results ── */}
				<div className="mt-4">
					{isLoadingInbox ? (
						<div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
							<Loader2 className="h-4 w-4 animate-spin" />
							{t("chat_search.loading")}
						</div>
					) : inboxError ? (
						<p className="py-10 text-center text-sm text-[var(--text-muted)]">{inboxError}</p>
					) : searchQuery.trim().length < 2 ? (
						<div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
							<Search className="h-8 w-8 opacity-30" />
							<p className="text-sm">{t("chat_search.min_chars")}</p>
						</div>
					) : (
						<div className="flex flex-col gap-1.5">

							{/* Conversations */}
							{searchMode === "conversations" && conversationSearchResults.map((result) => (
								<button
									key={result.conversationId}
									type="button"
									onClick={() => openConversationById(result.conversationId)}
									className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition hover:border-[var(--accent)]"
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm font-semibold uppercase text-[var(--text-muted)]">
										{result.name?.[0] ?? <MessageCircle className="h-4 w-4" />}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-semibold">{highlight(result.name, searchQuery)}</p>
										<p className="truncate text-xs text-[var(--text-muted)]">{result.preview || t("chat_search.no_preview")}</p>
									</div>
								</button>
							))}
							{searchMode === "conversations" && conversationSearchResults.length === 0 && (
								<div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
									<MessageCircle className="h-7 w-7 opacity-30" />
									<p className="text-sm">{t("chat_search.no_conversations_found")}</p>
								</div>
							)}

							{/* Messages */}
							{searchMode === "messages" && messageSearchResults.map((result) => (
								<button
									key={result.messageId}
									type="button"
									onClick={() => openMessageSearchResult(result)}
									className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition hover:border-[var(--accent)]"
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
										<MessageCircle className="h-4 w-4" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs text-[var(--text-muted)]">{result.conversationId}</p>
										<p className="mt-0.5 line-clamp-2 text-sm">{highlight(result.text, searchQuery)}</p>
									</div>
								</button>
							))}
							{searchMode === "messages" && messageSearchResults.length === 0 && (
								<div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
									<MessageCircle className="h-7 w-7 opacity-30" />
									<p className="text-sm">{t("chat_search.no_messages_found")}</p>
								</div>
							)}

							{/* Profiles — quick start by ID */}
							{searchMode === "profiles" && searchedProfileId ? (
								<button
									type="button"
									onClick={() => startChatByProfileId(String(searchedProfileId))}
									className="flex w-full items-center justify-between rounded-xl border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-3 py-2.5 text-left"
								>
									<div>
										<p className="text-sm font-semibold">{t("chat_search.start_chat_with", { profileId: searchedProfileId })}</p>
										<p className="text-xs text-[var(--text-muted)]">{t("chat_search.use_searched_id")}</p>
									</div>
									<ArrowRight className="h-4 w-4 shrink-0 text-[var(--accent-readable)]" />
								</button>
							) : null}

							{/* Profiles — results */}
							{searchMode === "profiles" && profileResults.map((profile) => {
								const returnTo = "/chat";
								return (
									<button
										key={profile.profileId}
										type="button"
										onClick={() => navigate(`/profile/${profile.profileId}?returnTo=${encodeURIComponent(returnTo)}`, { state: { returnTo } })}
										className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition hover:border-[var(--accent)]"
									>
										<div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--border)]">
											<ProfileImage
												src={getSearchProfileImage(profile.profileImageMediaHash)}
												alt={profile.displayName || t("chat_search.profile_alt")}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold">{highlight(profile.displayName, searchQuery)}</p>
											<p className="text-xs text-[var(--text-muted)]">
												{profile.distance != null
													? formatDistance(profile.distance * 1000, t, unitsPreset)
													: t("chat_search.distance_unavailable")}
											</p>
										</div>
									</button>
								);
							})}

							{/* Profiles — load more / refresh */}
							{searchMode === "profiles" && (
								<div className="mt-1 flex items-center gap-2">
									<button
										type="button"
										disabled={isSearchingProfiles}
										onClick={() => void runProfileSearch({ loadMore: false })}
										className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
									>
										{isSearchingProfiles ? (
											<span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{t("chat_search.searching")}</span>
										) : t("chat_search.refresh")}
									</button>
									{profileSearchAfterDistance && profileSearchAfterProfileId && (
										<button
											type="button"
											disabled={isSearchingProfiles}
											onClick={() => void runProfileSearch({ loadMore: true })}
											className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
										>
											{t("chat_search.load_more")}
										</button>
									)}
								</div>
							)}

							{searchMode === "profiles" && !isSearchingProfiles && profileResults.length === 0 && !searchedProfileId && (
								<div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
									<User className="h-7 w-7 opacity-30" />
									<p className="text-sm">{t("chat_search.no_profiles_found")}</p>
								</div>
							)}

						</div>
					)}
				</div>

			</div>
		</section>
	);
}
