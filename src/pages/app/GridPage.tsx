import { useAuth } from "../../contexts/AuthContext";
import { MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useEffect, useMemo, useState } from "react";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	type BrowseCard,
	type ManagedOption,
	type ProfileDetail,
} from "./GridPage.types";
import { BrowseGrid } from "./gridpage/components/BrowseGrid";
import { ProfileDetailsModal } from "./gridpage/components/ProfileDetailsModal";
import {
	getCachedBrowseCards,
	getCachedGenderOptions,
	getCachedProfileDetail,
	getCachedPronounOptions,
	setCachedBrowseCards,
	setCachedGenderOptions,
	setCachedProfileDetail,
	setCachedPronounOptions,
} from "./gridpage/cache";
import { isCurrentlyOnline } from "./gridpage/utils";
import { Avatar } from "../../components/ui/avatar";

export function GridPage() {
	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const {
		geohash,
		isLoading: isLoadingPreferences,
	} = usePreferences();
	const navigate = useNavigate();
	const [cards, setCards] = useState<BrowseCard[]>([]);
	const [isLoadingCards, setIsLoadingCards] = useState(true);
	const [isLoadingMoreCards, setIsLoadingMoreCards] = useState(false);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [cardsError, setCardsError] = useState<string | null>(null);
	const [profileImageHash, setProfileImageHash] = useState<string | null>(null);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
		null,
	);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(false);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(
		null,
	);
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);

	useEffect(() => {
		const loadManagedOptions = async () => {
			const cachedGenders = getCachedGenderOptions();
			const cachedPronouns = getCachedPronounOptions();

			if (cachedGenders) {
				setGenderOptions(cachedGenders);
			}

			if (cachedPronouns) {
				setPronounOptions(cachedPronouns);
			}

			if (cachedGenders && cachedPronouns) {
				return;
			}

			try {
				const [genders, pronouns] = await Promise.all([
					apiFunctions.getManagedGenders(),
					apiFunctions.getManagedPronouns(),
				]);

				const nextGenderOptions = genders.map((item) => ({
					value: item.genderId,
					label: item.gender,
				}));
				setGenderOptions(nextGenderOptions);
				setCachedGenderOptions(nextGenderOptions);

				const nextPronounOptions = pronouns.map((item) => ({
					value: item.pronounId,
					label: item.pronoun,
				}));
				setPronounOptions(nextPronounOptions);
				setCachedPronounOptions(nextPronounOptions);
			} catch {
				if (!cachedGenders) {
					setGenderOptions([]);
				}
				if (!cachedPronouns) {
					setPronounOptions([]);
				}
			}
		};

		void loadManagedOptions();
	}, [apiFunctions]);

	useEffect(() => {
		if (!userId) {
			setProfileImageHash(null);
			return;
		}

		let cancelled = false;

		const loadProfilePhoto = async () => {
			try {
				const parsed = await apiFunctions.getBrowseProfileMedia(userId);
				const mediaHashFromList = parsed.medias
					?.map((item) => item.mediaHash ?? "")
					.find((hash) => validateMediaHash(hash));
				const mediaHashFromProfile = parsed.profileImageMediaHash;
				const firstHash =
					mediaHashFromList ??
					(mediaHashFromProfile && validateMediaHash(mediaHashFromProfile)
						? mediaHashFromProfile
						: null);

				if (!cancelled) {
					setProfileImageHash(firstHash ?? null);
				}
			} catch {
				if (!cancelled) {
					setProfileImageHash(null);
				}
			}
		};

		void loadProfilePhoto();

		return () => {
			cancelled = true;
		};
	}, [apiFunctions, userId]);

	useEffect(() => {
		let cancelled = false;

		const loadBrowseCards = async (page?: number) => {
			if (isLoadingPreferences) {
				return;
			}

			if (!geohash) {
				if (!cancelled) {
					setIsLoadingCards(true);
					setCards([]);
					setCardsError(
						"Tap the location pin (📍) button above to set your location.",
					);
					setIsLoadingCards(false);
				}
				return;
			}

			const cachedCards = getCachedBrowseCards(geohash);
			setCardsError(null);

			if (cachedCards) {
				if (!cancelled) {
					setCards(cachedCards);
					setIsLoadingCards(false);
				}
			} else {
				setIsLoadingCards(true);
			}

			try {
				const parsed = await apiFunctions.getBrowseCards({
					geohash,
					page,
				});

				if (!cancelled) {
					setCards(parsed.cards);
					setCachedBrowseCards(geohash, parsed.cards);
					setNextPage(parsed.nextPage ?? null);
				}
			} catch (error) {
				if (!cancelled) {
					if (!cachedCards) {
						setCards([]);
						setCardsError(
							error instanceof Error
								? error.message
								: "Failed to load browse profiles",
						);
					}
				}
			} finally {
				if (!cancelled) {
					setIsLoadingCards(false);
				}
			}
		};

		void loadBrowseCards();

		return () => {
			cancelled = true;
		};
	}, [apiFunctions, geohash, isLoadingPreferences]);

	const handleLoadMoreCards = async () => {
		if (!geohash || !nextPage || isLoadingMoreCards) return;
		setIsLoadingMoreCards(true);
		let cancelled = false;
		try {
			const parsed = await apiFunctions.getBrowseCards({
				geohash,
				page: nextPage,
			});
			if (!cancelled) {
				setCards((prev) => [...prev, ...parsed.cards]);
				setNextPage(parsed.nextPage ?? null);
			}
		} catch {
			// silently fail — existing cards remain
		} finally {
			if (!cancelled) setIsLoadingMoreCards(false);
		}
	};

	useEffect(() => {
		if (!activeProfileId) {
			setActiveProfile(null);
			setActiveProfileError(null);
			setIsLoadingActiveProfile(false);
			return;
		}

		let cancelled = false;

		const loadProfileDetails = async () => {
			const cachedProfile = getCachedProfileDetail(activeProfileId);

			if (cachedProfile) {
				setActiveProfile(cachedProfile);
				setIsLoadingActiveProfile(false);
			} else {
				setIsLoadingActiveProfile(true);
			}

			setActiveProfileError(null);

			try {
				const parsed = await apiFunctions.getProfileDetail(activeProfileId);

				if (!cancelled) {
					setActiveProfile(parsed);
					setCachedProfileDetail(activeProfileId, parsed);
				}
			} catch (error) {
				if (!cancelled) {
					if (!cachedProfile) {
						setActiveProfile(null);
						setActiveProfileError(
							error instanceof Error
								? error.message
								: "Failed to load profile details",
						);
					}
				}
			} finally {
				if (!cancelled) {
					setIsLoadingActiveProfile(false);
				}
			}
		};

		void loadProfileDetails();

		return () => {
			cancelled = true;
		};
	}, [activeProfileId, apiFunctions]);

	const profilePhotoUrl = useMemo(() => {
		if (!profileImageHash) {
			return null;
		}

		return getThumbImageUrl(profileImageHash, "75x75");
	}, [profileImageHash]);

	const onlineCount = useMemo(
		() => cards.filter((card) => isCurrentlyOnline(card.onlineUntil)).length,
		[cards],
	);

	const selectedBrowseCard = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}

		return cards.find((card) => card.profileId === activeProfileId) ?? null;
	}, [activeProfileId, cards]);

	const activeProfilePhotoHashes = useMemo(() => {
		if (!activeProfile) {
			return [];
		}

		const fromList = activeProfile.medias
			.map((item) => item.mediaHash ?? "")
			.filter((hash): hash is string => validateMediaHash(hash));

		const hashes = [...fromList];

		if (
			activeProfile.profileImageMediaHash &&
			validateMediaHash(activeProfile.profileImageMediaHash) &&
			!hashes.includes(activeProfile.profileImageMediaHash)
		) {
			hashes.unshift(activeProfile.profileImageMediaHash);
		}

		return hashes;
	}, [activeProfile]);

	const handleSelectProfile = (profileId: string) => {
		if (window.matchMedia("(max-width: 639px)").matches) {
			navigate(`/profile/${profileId}`);
			return;
		}

		setActiveProfileId(profileId);
	};

	const handleMessageProfile = (profileId: string) => {
		navigate(`/chat?targetProfileId=${encodeURIComponent(profileId)}`);
	};

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-6xl">
				<header className="mb-6">
					<div className="mb-2 flex items-start justify-between gap-4">
						<div>
							<h1 className="app-title">Browse Profiles</h1>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
									<span
										className="h-2 w-2 rounded-full bg-zinc-400"
										aria-hidden="true"
									/>
									<span>{cards.length}</span>
								</div>
								<div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
									<span
										className="h-2 w-2 rounded-full bg-emerald-500"
										aria-hidden="true"
									/>
									<span>{onlineCount}</span>
								</div>
								<button
									type="button"
									onClick={() => navigate("/browse/location")}
									className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
								>
									<MapPin className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
						<div className="flex flex-col items-end gap-2">
							<button
								type="button"
								onClick={() => navigate("/settings")}
								className="rounded-full transition-all hover:scale-[1.03]"
								aria-label="Open settings"
								title="Settings"
							>
								<Avatar
									src={profilePhotoUrl}
									alt="Your profile photo"
									className="h-11 w-11"
								/>
							</button>
						</div>
					</div>
					<p className="app-subtitle">
						Discover people near you and jump into chats from the main feed.
					</p>
				</header>

				<BrowseGrid
					isLoadingCards={isLoadingCards}
					cardsError={cardsError}
					cards={cards}
					onSelectProfile={handleSelectProfile}
					onMessageProfile={handleMessageProfile}
					hasMore={nextPage !== null}
					isLoadingMore={isLoadingMoreCards}
					onLoadMore={() => {
						void handleLoadMoreCards();
					}}
				/>

				<ProfileDetailsModal
					isOpen={Boolean(activeProfileId)}
					onClose={() => setActiveProfileId(null)}
					activeProfile={activeProfile}
					selectedBrowseCard={selectedBrowseCard}
					isLoadingActiveProfile={isLoadingActiveProfile}
					activeProfileError={activeProfileError}
					activeProfilePhotoHashes={activeProfilePhotoHashes}
					genderOptions={genderOptions}
					pronounOptions={pronounOptions}
				/>
			</div>
		</section>
	);
}
