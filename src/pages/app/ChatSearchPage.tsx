import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { usePreferences } from "../../contexts/PreferencesContext";
import type { ConversationEntry } from "../../types/messages";
import type { ProfileSearchResult, SearchMode } from "../../types/chat-page";
import { getProfileImageUrl, validateMediaHash } from "../../utils/media";
import blankProfileImage from "../../images/blank-profile.png";
import {
	indexConversations,
	searchConversationsLocal,
	searchMessagesLocal,
} from "./chat/cache";
import { highlightMatch } from "./chat/highlightMatch";

export function ChatSearchPage() {
	const navigate = useNavigate();
	const service = useApiFunctions();
	const { geohash } = usePreferences();
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
			return blankProfileImage;
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

	return (
		<section className="app-screen" style={{ paddingLeft: 0, paddingRight: 0 }}>
			<div className="w-full">
				<div className="flex h-full flex-col overflow-hidden p-3 sm:p-4">
					<div className="mb-3 flex items-center justify-between gap-3">
						<div>
							<h1 className="app-title">{t("chat_search.title")}</h1>
							<p className="app-subtitle mt-1">
								{t("chat_search.subtitle")}
							</p>
						</div>
						<button
							type="button"
							onClick={() => navigate("/chat")}
							className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						>
							{t("chat_search.back_to_inbox")}
						</button>
					</div>

					<div className="mb-3">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" />
							<input
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder={t("chat_search.placeholder")}
								className="input-field pl-9"
							/>
						</div>
						<form
							onSubmit={(event) => {
								event.preventDefault();
								startChatByProfileId(startChatProfileIdDraft);
							}}
							className="mt-2 flex items-center gap-2"
						>
							<input
								type="text"
								inputMode="numeric"
								value={startChatProfileIdDraft}
								onChange={(event) =>
									setStartChatProfileIdDraft(event.target.value)
								}
								placeholder={t("chat_search.quick_start_placeholder")}
								className="input-field h-9 text-sm"
							/>
							<button
								type="button"
								onClick={() => viewProfileById(startChatProfileIdDraft)}
								className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								{t("chat_search.view")}
							</button>
							<button
								type="submit"
								className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								{t("chat_search.message")}
							</button>
						</form>
						<div className="mt-2 flex flex-wrap gap-2">
							{(["messages", "conversations", "profiles"] as const).map(
								(mode) => (
									<button
										key={mode}
										type="button"
										onClick={() => setSearchMode(mode)}
										className={`rounded-lg border px-2 py-1 text-xs capitalize transition ${
											searchMode === mode
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]"
										}`}
									>
										{t(`chat_search.modes.${mode}`)}
									</button>
								),
							)}
						</div>
					</div>

					{isLoadingInbox ? (
						<div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
							<Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chat_search.loading")}
						</div>
					) : inboxError ? (
						<div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
							{inboxError}
						</div>
					) : searchQuery.trim().length < 2 ? (
						<div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
							{t("chat_search.min_chars")}
						</div>
					) : (
						<div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
							{searchMode === "conversations"
								? conversationSearchResults.map((result) => (
										<button
											key={result.conversationId}
											type="button"
											onClick={() => openConversationById(result.conversationId)}
											className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]"
										>
											<p className="truncate text-sm font-semibold">
												{highlightMatch(result.name, searchQuery).map((part, index) =>
													part.match ? (
														<mark
															key={`${result.conversationId}-name-${index}`}
															className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]"
														>
															{part.text}
														</mark>
													) : (
														<span key={`${result.conversationId}-name-${index}`}>
															{part.text}
														</span>
													),
												)}
											</p>
											<p className="mt-1 truncate text-xs text-[var(--text-muted)]">
												{result.preview || t("chat_search.no_preview")}
											</p>
										</button>
									))
								: null}

							{searchMode === "messages"
								? messageSearchResults.map((result) => (
										<button
											key={result.messageId}
											type="button"
											onClick={() => openMessageSearchResult(result)}
											className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]"
										>
											<p className="truncate text-xs text-[var(--text-muted)]">
												{result.conversationId}
											</p>
											<p className="mt-1 text-sm">
												{highlightMatch(result.text, searchQuery).map((part, index) =>
													part.match ? (
														<mark
															key={`${result.messageId}-${index}`}
															className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]"
														>
															{part.text}
														</mark>
													) : (
														<span key={`${result.messageId}-${index}`}>
															{part.text}
														</span>
													),
												)}
											</p>
										</button>
									))
								: null}

							{searchMode === "profiles" && searchedProfileId ? (
								<button
									type="button"
									onClick={() => startChatByProfileId(String(searchedProfileId))}
									className="flex w-full items-center justify-between rounded-xl border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] p-3 text-left transition hover:border-[var(--accent)]"
								>
									<div>
										<p className="text-sm font-semibold">
											{t("chat_search.start_chat_with", { profileId: searchedProfileId })}
										</p>
										<p className="text-xs text-[var(--text-muted)]">
											{t("chat_search.use_searched_id")}
										</p>
									</div>
									<span className="text-xs font-semibold text-[var(--accent-readable)]">
										{t("chat_search.start")}
									</span>
								</button>
							) : null}

							{searchMode === "profiles"
								? profileResults.map((profile) => {
										const returnTo = "/chat";
										return (
											<button
												key={profile.profileId}
												type="button"
												onClick={() =>
													navigate(
														`/profile/${profile.profileId}?returnTo=${encodeURIComponent(returnTo)}`,
														{ state: { returnTo } },
													)
												}
												className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]"
											>
												<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)]">
													<img
														src={getSearchProfileImage(profile.profileImageMediaHash)}
														alt={profile.displayName || t("chat_search.profile_alt")}
														className="h-full w-full object-cover"
													/>
												</div>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-semibold">
														{highlightMatch(profile.displayName, searchQuery).map(
															(part, index) =>
																part.match ? (
																	<mark
																		key={`${profile.profileId}-${index}`}
																		className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]"
																	>
																		{part.text}
																	</mark>
																) : (
																	<span key={`${profile.profileId}-${index}`}>
																		{part.text}
																	</span>
																),
														)}
													</p>
													<p className="text-xs text-[var(--text-muted)]">
														{profile.distance != null
															? `${profile.distance.toFixed(1)} km`
															: t("chat_search.distance_unavailable")}
													</p>
												</div>
											</button>
										);
								  })
								: null}

							{searchMode === "profiles" ? (
								<div className="mt-2 flex items-center gap-2">
									<button
										type="button"
										disabled={isSearchingProfiles}
										onClick={() => void runProfileSearch({ loadMore: false })}
										className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]"
									>
										{isSearchingProfiles ? t("chat_search.searching") : t("chat_search.refresh")}
									</button>
									{profileSearchAfterDistance && profileSearchAfterProfileId ? (
										<button
											type="button"
											disabled={isSearchingProfiles}
											onClick={() => void runProfileSearch({ loadMore: true })}
											className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]"
										>
											{t("chat_search.load_more")}
										</button>
									) : null}
								</div>
							) : null}

							{searchMode === "conversations" &&
							conversationSearchResults.length === 0 ? (
								<p className="text-xs text-[var(--text-muted)]">
									{t("chat_search.no_conversations_found")}
								</p>
							) : null}
							{searchMode === "messages" && messageSearchResults.length === 0 ? (
								<p className="text-xs text-[var(--text-muted)]">
									{t("chat_search.no_messages_found")}
								</p>
							) : null}
							{searchMode === "profiles" &&
							!isSearchingProfiles &&
							profileResults.length === 0 ? (
								<p className="text-xs text-[var(--text-muted)]">
									{t("chat_search.no_profiles_found")}
								</p>
							) : null}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
