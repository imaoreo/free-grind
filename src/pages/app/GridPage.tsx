import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CircleUserRound } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import z from "zod";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";

const browseProfileSchema = z.object({
	profiles: z
		.array(
			z.object({
				profileImageMediaHash: z.string().nullable().optional(),
				medias: z
					.array(z.object({ mediaHash: z.string().optional() }))
					.optional()
					.default([]),
			}),
		)
		.length(1),
});

export function GridPage() {
	const { userId, logout } = useAuth();
	const { fetchRest } = useApi();
	const navigate = useNavigate();
	const [profileImageHash, setProfileImageHash] = useState<string | null>(null);

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Logout failed:", error);
		}
	};

	useEffect(() => {
		if (!userId) {
			setProfileImageHash(null);
			return;
		}

		let cancelled = false;

		const loadProfilePhoto = async () => {
			try {
				const response = await fetchRest(`/v7/profiles/${userId}`);

				if (response.status < 200 || response.status >= 300) {
					if (!cancelled) {
						setProfileImageHash(null);
					}
					return;
				}

				const parsed = browseProfileSchema.parse(response.json());
				const mediaHashFromList = parsed.profiles[0]?.medias
					?.map((item) => item.mediaHash ?? "")
					.find((hash) => validateMediaHash(hash));
				const mediaHashFromProfile = parsed.profiles[0]?.profileImageMediaHash;
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
	}, [fetchRest, userId]);

	const profilePhotoUrl = useMemo(() => {
		if (!profileImageHash) {
			return null;
		}

		return getThumbImageUrl(profileImageHash, "75x75");
	}, [profileImageHash]);

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<header className="mb-6">
					<div className="mb-2 flex items-start justify-between gap-4">
						<div>
							<h1 className="app-title">Browse Profiles</h1>
						</div>
						<button
							type="button"
							onClick={() => navigate("/settings")}
							className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-all hover:scale-[1.03]"
							aria-label="Open settings"
							title="Settings"
						>
							{profilePhotoUrl ? (
								<img
									src={profilePhotoUrl}
									alt="Your profile photo"
									className="h-full w-full rounded-full object-cover"
								/>
							) : (
								<CircleUserRound className="h-6 w-6" />
							)}
						</button>
					</div>
					<p className="app-subtitle">
						Profile Grid - This is where the main app content will go
					</p>
				</header>
				<div className="surface-card p-5 sm:p-6">
					<p className="text-[var(--text-muted)]">
						Logged in as: <span className="font-semibold">{userId}</span>
					</p>
					<button
						onClick={handleLogout}
						className="btn-accent mt-5 px-4 py-2.5"
					>
						Logout
					</button>
				</div>
			</div>
		</section>
	);
}
