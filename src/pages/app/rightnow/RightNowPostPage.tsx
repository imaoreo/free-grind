import { X, Plus, Home, Camera, Map, Loader2, CheckCircle2, AlertCircle, EyeOff, Droplet, Info, Lock, Hourglass } from "lucide-react";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { appLog } from "../../../utils/logger";
import toast from "react-hot-toast";
import { cn } from "../../../utils/cn";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { decodeGeohash } from "../../../utils/geohash";
import { prepare1024SquareImage } from "../../../utils/media";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import type { RightNowCreatePostRequest, RightNowUpdatePostRequest } from "../../../services/apiFunctions";
import { buildBinaryUpload } from "../chat/chatUtils";
import { getRightNowSessionDuration } from "./rightnow-constants";
import { simulateCreatePost, simulateEndSession, simulateFetchActivePost, simulateUpdatePost, simulateUploadMedia } from "./rightnow-simulation";

interface RightNowPostPageProps {
	onClose: () => void;
	onPost: (isEdit: boolean) => void;
}

export function RightNowPostPage({ onClose, onPost }: RightNowPostPageProps) {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const { geohash, setPreferences, activeRightNowId, activeRightNowExpiresAt, developerMode, showDebugInfo, rightNowRemaining, rightNowTestMode } = usePreferences();
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [text, setText] = useState("");
	const [isHosting, setIsHosting] = useState(false);
	const [isHidden, setIsHidden] = useState(false);
	const [showOnMap, setShowOnMap] = useState(false);
	const [mediaId, setMediaId] = useState<number | null>(null);
	const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isPosting, setIsPosting] = useState(false);
	const [isEnding, setIsEnding] = useState(false);
	const [showTooltip, setShowTooltip] = useState(false);

	const [debugInfo, setDebugInfo] = useState<{ time: string; data: any } | null>(null);
	const [debugId, setDebugId] = useState("");
	const [debugExpires, setDebugExpires] = useState("");
	const [debugClickCount, setDebugClickCount] = useState(0);

	const sessionDuration = getRightNowSessionDuration(rightNowTestMode);
	const initialMins = Math.floor(sessionDuration / 60000);
	const [timeLeft, setTimeLeft] = useState<{ mins: number; percent: number }>({ mins: initialMins, percent: 100 });
	const [displayMins, setDisplayMins] = useState(initialMins);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const maxChars = 140;

	const isEditMode = useMemo(() => {
		if (!activeRightNowId || !activeRightNowExpiresAt) return false;
		return Date.now() < activeRightNowExpiresAt;
	}, [activeRightNowId, activeRightNowExpiresAt]);

	const canPost = useMemo(() => isEditMode || rightNowRemaining > 0, [isEditMode, rightNowRemaining]);

	useEffect(() => {
		if (!isEditMode) return;

		const fetchActivePost = async () => {
			try {
				let post: any;
				if (rightNowTestMode) {
					const mockResponse = await simulateFetchActivePost(text, isHosting, showOnMap, mediaId, thumbnailUrl, isHidden);
					setDebugInfo({ time: new Date().toLocaleTimeString(), data: mockResponse });
					post = mockResponse.post;
				} else {
					const response = await apiFunctions.getActiveRightNowPost();
					post = response.post;
				}

				setText(post.activeText || "");
				setIsHosting(post.hosting);
				setIsHidden(post.postStatus === "HIDDEN");
				setShowOnMap(post.shareLocation === "DISTANCE_AND_MAP");

				if (post.media && post.media.length > 0) {
					const m = post.media[0];
					// Handle both nested (simulation) and flat (real API) structures
					setMediaId(m.data?.mediaId ?? m.mediaId);
					// Use fullImageUrl for full image preview
					setThumbnailUrl(m.data?.fullImageUrl ?? m.fullImageUrl ?? m.data?.thumbnailUrl ?? m.thumbnailUrl);
				}
			} catch (error) {
				appLog.error("Failed to fetch active post:", error);
				toast.error(t("right_now.error_fetch_session"));
				setDebugInfo({
					time: new Date().toLocaleTimeString(),
					data: { error: error instanceof Error ? error.message : "Unknown error" }
				});
			}
		};

		void fetchActivePost();
	}, [isEditMode, apiFunctions]);

	useEffect(() => {
		if (!isEditMode || !activeRightNowExpiresAt) return;

		const update = (initial = false) => {
			const now = Date.now();
			if (now >= activeRightNowExpiresAt) {
				handleClose();
				void setPreferences({
					activeRightNowId: null,
					activeRightNowExpiresAt: null,
				});
				toast.error(t("right_now.session_expired"), { id: "right-now-expired" });
				return;
			}

			const total = sessionDuration;
			const remaining = activeRightNowExpiresAt - now;
			const targetMins = Math.max(0, Math.ceil(remaining / 60000));
			const percent = Math.max(0, Math.min(100, (remaining / total) * 100));
			setTimeLeft({ mins: targetMins, percent });

			if (initial) {
				const duration = 1000;
				const start = Date.now();
				const startMins = Math.floor(sessionDuration / 60000);

				const animate = () => {
					const elapsed = Date.now() - start;
					const progress = Math.min(elapsed / duration, 1);
					const easedProgress = 1 - Math.pow(1 - progress, 3);
					const current = Math.round(startMins - (startMins - targetMins) * easedProgress);
					setDisplayMins(current);

					if (progress < 1) {
						requestAnimationFrame(animate);
					}
				};
				requestAnimationFrame(animate);
			} else {
				setDisplayMins(targetMins);
			}
		};

		update(true);
		const interval = setInterval(() => update(false), 10000);
		return () => clearInterval(interval);
	}, [isEditMode, activeRightNowExpiresAt]);

	const currentLocation = useMemo(() => {
		if (!geohash) return null;
		try {
			const decoded = decodeGeohash(geohash);
			return {
				lat: (decoded.lat[0] + decoded.lat[1]) / 2,
				lon: (decoded.lon[0] + decoded.lon[1]) / 2,
			};
		} catch {
			return null;
		}
	}, [geohash]);

	const handleClose = useCallback(() => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);

		if (window.history.state?.modal === "right-now-post") {
			window.history.back();
		}

		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
		}
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
		if (window.history.state?.modal !== "right-now-post") {
			window.history.pushState({ modal: "right-now-post" }, "");
		}

		const handlePopState = (e: PopStateEvent) => {
			if (e.state?.modal !== "right-now-post") {
				handleClose();
			}
		};

		window.addEventListener("popstate", handlePopState);
		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [handleClose]);

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setIsUploading(true);

		try {
			if (rightNowTestMode) {
				const result = await simulateUploadMedia(file);
				setMediaId(result.mediaId);
				setThumbnailUrl(result.thumbnailUrl);
			} else {
				// 1. Resize locally to 1024px to prevent 500 error and corner-crop
				const resizedBlob = await prepare1024SquareImage(file);
				const body = new Uint8Array(await resizedBlob.arrayBuffer());
				const contentType = "image/jpeg";
				const coords = { top: 0, left: 0, right: 1024, bottom: 1024 };

				const result = await apiFunctions.uploadRightNowMedia({
					body,
					contentType,
					coords,
				});
				setMediaId(result.mediaId);
				// 2. Only show image AFTER successful upload from server response
				setThumbnailUrl(result.thumbnailUrl);
			}
		} catch (error) {
			appLog.error("Upload failed", error);
			toast.error(t("right_now.error_upload"));
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	const handlePost = async () => {
		if (isPosting || !canPost) return;

		setIsPosting(true);

		try {
			if (isEditMode && activeRightNowId) {
				const updatePayload: RightNowUpdatePostRequest = {
					text: text.trim(),
					hosting: isHosting,
					hidden: isHidden,
					media: mediaId
						? [
								{
									type: "image_v1",
									data: { id: mediaId },
								},
						  ]
						: [],
					shareLocation: showOnMap ? "DISTANCE_AND_MAP" : "DISTANCE_ONLY",
					sharedFields: [], // Mandatory empty list by default
				};

				if (rightNowTestMode) {
					await simulateUpdatePost(activeRightNowId, updatePayload);
				} else {
					await apiFunctions.updateRightNowPost(activeRightNowId, updatePayload);
				}
			} else {
				const createPayload: RightNowCreatePostRequest = {
					text: text.trim(),
					shareLocation: showOnMap ? "DISTANCE_AND_MAP" : "DISTANCE_ONLY",
					lat: null,
					lon: null,
					locationRadius: null,
					media: mediaId
						? [
								{
									type: "image_v1",
									data: { id: mediaId },
								},
						  ]
						: [],
					hosting: isHosting,
					sharedFields: [], // Mandatory empty list
				};

				if (rightNowTestMode) {
					const { id, expiresAt } = await simulateCreatePost(createPayload);
					await setPreferences({
						activeRightNowId: id,
						activeRightNowExpiresAt: expiresAt,
						rightNowRemaining: Math.max(0, rightNowRemaining - 1),
					});
				} else {
					const response = await apiFunctions.createRightNowPost(createPayload);
					// Fallback to local duration if server doesn't provide expiration
					const expiresAt = response.post.expiration || (Date.now() + sessionDuration);
					await setPreferences({
						activeRightNowId: response.post.id,
						activeRightNowExpiresAt: expiresAt,
						rightNowRemaining: Math.max(0, rightNowRemaining - 1),
					});
				}
			}

			toast.success(
				isEditMode
					? t("right_now.session_updated")
					: t("right_now.session_created"),
				{
					icon: <CheckCircle2 className="w-5 h-5 text-[var(--right-now)]" />,
				},
			);

			onPost(isEditMode);
			handleClose();
		} catch (error) {
			appLog.error("Failed to post:", error);
			toast.error(isEditMode ? t("right_now.error_session_update_failed") : t("right_now.error_session_failed"));
		} finally {
			setIsPosting(false);
		}
	};

	const handleEndSession = async () => {
		if (!activeRightNowId || isEnding) return;

		setIsEnding(true);

		try {
			// Always call simulation in test mode, ignore API if not available
			if (rightNowTestMode) {
				await simulateEndSession(activeRightNowId);
			} else {
				// We only have API support for ending in test mode or if it's explicitly supported
				// If you want to support it via API, it needs to be in apiFunctions
				// For now, we only clear local state if not in test mode
			}

			await setPreferences({
				activeRightNowId: null,
				activeRightNowExpiresAt: null,
			});

			toast.success(t("right_now.session_ended"), {
				icon: <CheckCircle2 className="w-5 h-5 text-[var(--right-now)]" />,
			});
			handleClose();
		} catch (error) {
			appLog.error("Failed to end session:", error);
			toast.error(t("right_now.error_end_failed"));
		} finally {
			setIsEnding(false);
		}
	};



	return (
		<div
			className={`fixed inset-0 z-40 flex flex-col no-touch-callout isolate ${
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

			{/* Modal Content */}
			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-out" : "animate-modal-in"
				} md:border-x md:border-[var(--border)]`}
				style={{
					paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 90px)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative z-10 flex items-center justify-between px-[var(--app-px)] py-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<h2 className="text-xl font-bold text-[var(--text)]">
						{isEditMode
							? t("right_now.edit_session_title")
							: t("right_now.create_session_title")}
					</h2>
					<button
						type="button"
						onClick={handleClose}
						className="rounded-full bg-[var(--surface-2)] p-2 text-[var(--text)] transition hover:opacity-90 shadow-sm"
						aria-label={t("right_now.close_aria")}
					>
						<X className="h-5 w-5" />
					</button>
				</header>

				{/* Progress Bar (Edit Mode) */}
				{isEditMode && activeRightNowExpiresAt && (
					<div className="relative z-10 px-[var(--app-px)] mx-1 pb-2">
						<style>
							{`
								@keyframes hourglass-rotate {
									0% { transform: rotate(0deg); }
									40% { transform: rotate(180deg); }
									60% { transform: rotate(180deg); }
									100% { transform: rotate(360deg); }
								}
								.animate-hourglass-rotate {
									animation: hourglass-rotate 4.5s infinite ease-in-out;
								}
							`}
						</style>
						<div className="flex items-center gap-3">
							<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
								<div
									className="h-full bg-[var(--right-now)] transition-all duration-1000 ease-out"
									style={{ width: `${timeLeft.percent}%` }}
								/>
							</div>
							<div className="flex items-center gap-1.5 min-w-[5.5rem] justify-end text-xs font-bold text-[var(--right-now)]">
								<Hourglass className="h-3.5 w-3.5 animate-hourglass-rotate" />
								<span className="tabular-nums">
									{displayMins}m {t("right_now.remaining")}
								</span>
							</div>
						</div>
					</div>
				)}

				{/* Top Status Bar: Credits (New) or Visibility Toggle (Edit) */}
				<div className="relative z-10 px-[var(--app-px)] pb-2 space-y-3">
					{isEditMode ? (
						<button
							type="button"
							onClick={() => setIsHidden(!isHidden)}
							className={cn(
								"flex w-full items-center justify-between rounded-2xl bg-[var(--surface-2)] p-3 border border-[var(--border)] shadow-sm active:scale-[0.99] transition-transform",
								!isHidden ? "text-[var(--right-now)]" : "text-[var(--text)]"
							)}
						>
							<div className="flex items-center gap-4">
								<div className={cn(
									"flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors",
									isHidden ? "bg-[var(--text-muted)]" : "bg-[var(--right-now)]"
								)}>
									<Droplet className="h-5 w-5 fill-current" />
								</div>
								<div className="text-left">
									<div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-70">
										{t("right_now.visibility")}
									</div>
									<div className="font-black text-[var(--text)]">
										{isHidden ? t("right_now.status_hidden") : t("right_now.status_visible")}
									</div>
								</div>
							</div>
							<div className={cn(
								"h-6 w-11 rounded-full p-1 transition-colors duration-200",
								!isHidden ? "bg-[var(--right-now)]" : "bg-[var(--text-muted)]/20"
							)}>
								<div className={cn(
									"h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
									!isHidden ? "translate-x-5" : "translate-x-0"
								)} />
							</div>
						</button>
					) : (
						<div className="flex items-center justify-between rounded-2xl bg-[var(--surface-2)] p-3 border border-[var(--border)] shadow-sm">
							<div className="flex items-center gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--right-now)] text-white shadow-sm">
									<Droplet className="h-5 w-5 fill-current" />
								</div>
								<div>
									<div className="flex items-center gap-1.5">
										<div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-70">
											{t("right_now.weekly_limit")}
										</div>
									</div>
									<div className="font-black text-[var(--text)]">
										{rightNowRemaining} {t("right_now.remaining_count")}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<div className="flex gap-1">
									{Array.from({ length: Math.max(2, rightNowRemaining) }).map((_, i) => (
										<div
											key={i}
											className={cn(
												"h-1.5 w-5 rounded-full",
												i < rightNowRemaining
													? "bg-[var(--right-now)]"
													: rightNowRemaining === 0
														? "border border-[var(--text-muted)] opacity-20 bg-transparent"
														: "border border-[var(--right-now)]/30 bg-transparent"
											)}
										/>
									))}
								</div>
								<span className={cn(
									"text-xs font-black tabular-nums",
									rightNowRemaining === 0 ? "text-[var(--text-muted)] opacity-70" : "text-[var(--right-now)]"
								)}>
									{rightNowRemaining}/{Math.max(2, rightNowRemaining)}
								</span>
							</div>
						</div>
					)}

					{/* Next Refresh Info */}
					{!isEditMode && !canPost && (
						<div className="flex items-center gap-4 rounded-2xl bg-[var(--surface-2)] p-3 border border-[var(--border)] shadow-sm animate-in fade-in slide-in-from-top-2">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
								<AlertCircle className="h-5 w-5" />
							</div>
							<div>
								<div className="text-[10px] font-bold uppercase tracking-widest text-orange-500/60">
									{t("right_now.next_refresh")}
								</div>
								<div className="text-sm font-bold text-[var(--text)]">
									{t("right_now.refresh_time")}
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Content */}
				<div
					className={cn(
						"relative z-10 flex-1 px-[var(--app-px)] pb-6",
						canPost ? "overflow-y-auto" : "overflow-hidden"
					)}
				>
					<div className={cn("space-y-4 py-4", !canPost && "h-full flex flex-col justify-center")}>
						{!canPost ? (
							/* State-of-the-art Empty/Locked State */
							<div className="flex flex-col items-center justify-center px-4 text-center animate-in fade-in zoom-in-95 duration-500">
								<div className="relative mb-6">
									{/* Original Single Glow with Noise & GPU Acceleration */}
									<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 animate-morph-glow bg-[var(--right-now)]/15 blur-2xl rounded-full opacity-40 transform-gpu will-change-transform overflow-hidden pointer-events-none">
										<div
											className="absolute inset-0 opacity-[0.15] mix-blend-overlay pointer-events-none"
											style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
										/>
									</div>
									<div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-2)] border-2 border-dashed border-[var(--right-now)]/30 shadow-inner">
										<Lock className="h-9 w-9 text-[var(--text-muted)] opacity-50" />
									</div>
								</div>
								<h3 className="text-xl font-black text-[var(--text)] mb-2">
									{t("right_now.limit_reached_title")}
								</h3>
								<p className="text-sm text-[var(--text-muted)] max-w-[240px] leading-relaxed">
									{t("right_now.limit_reached_desc")}
								</p>
							</div>
						) : (
							/* Regular Form */
							<>
								<div className="relative">
									<textarea
										autoFocus
										value={text}
										onChange={(e) => setText(e.target.value.slice(0, maxChars))}
										placeholder={t("right_now.session_placeholder")}
										className="w-full min-h-[100px] resize-none rounded-2xl border border-transparent bg-[var(--surface-2)] p-4 pb-8 text-[var(--text)] outline-none focus:border-[var(--right-now)] focus:ring-1 focus:ring-[var(--right-now)] transition-all"
									/>
									<div className="absolute bottom-3 right-4 text-[10px] font-medium text-[var(--text-muted)] opacity-70">
										{t("right_now.char_limit", { count: text.length })}
									</div>
								</div>

								{/* Photo Selector */}
								<div className="relative">
									<input
										type="file"
										ref={fileInputRef}
										onChange={handleFileSelect}
										accept="image/*"
										className="hidden"
									/>
									{thumbnailUrl ? (
										<div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[var(--surface-2)] shadow-sm border border-[var(--border)]">
											<img
												src={thumbnailUrl}
												className="h-full w-full object-cover"
												alt={t("right_now.upload_preview_alt")}
											/>
											<button
												type="button"
												onClick={() => {
													setMediaId(null);
													setThumbnailUrl(null);
												}}
												className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white backdrop-blur-md transition hover:bg-black/80"
											>
												<X className="h-5 w-5" />
											</button>
										</div>
									) : (
										<button
											type="button"
											onClick={() => fileInputRef.current?.click()}
											disabled={isUploading}
											className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 text-[var(--text)] shadow-sm border border-[var(--border)] active:scale-[0.98] transition-transform disabled:opacity-50"
										>
											<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)]">
												{isUploading ? (
													<Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
												) : (
													<Plus className="h-5 w-5 text-[var(--text-muted)]" />
												)}
											</div>
											<div className="flex items-center gap-2 font-semibold">
												<Camera className="h-4 w-4 text-[var(--text-muted)]" />
												{isUploading
													? t("right_now.uploading")
													: t("right_now.add_photo")}
											</div>
										</button>
									)}
								</div>

								<div className="space-y-1">
									{/* Hosting Toggle */}
									<button
										type="button"
										onClick={() => setIsHosting(!isHosting)}
										className={cn(
											"flex w-full items-center justify-between p-4 transition-all duration-200",
											isHosting ? "text-[var(--right-now)]" : "text-[var(--text)]"
										)}
									>
										<div className="flex items-center gap-3">
											<div className={cn(
												"flex h-10 w-10 items-center justify-center rounded-full transition-colors",
												isHosting ? "bg-[var(--right-now)] text-white" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
											)}>
												<Home className="h-5 w-5" />
											</div>
											<span className="font-semibold">{t("right_now.i_am_hosting")}</span>
										</div>
										<div className={cn(
											"h-6 w-11 rounded-full p-1 transition-colors duration-200",
											isHosting ? "bg-[var(--right-now)]" : "bg-[var(--text-muted)]/20"
										)}>
											<div className={cn(
												"h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
												isHosting ? "translate-x-5" : "translate-x-0"
											)} />
										</div>
									</button>
								</div>
							</>
						)}

						{canPost && (
							<div className="pt-4">
								<button
									type="button"
									onClick={handlePost}
									disabled={isPosting}
									className="group relative overflow-hidden w-full rounded-2xl bg-[var(--right-now)] py-4 text-center font-bold text-white shadow-lg shadow-[var(--right-now)]/20 active:scale-[0.98] transition-all hover:brightness-110 disabled:opacity-70 flex items-center justify-center gap-2"
								>
									<div className="relative z-10 flex items-center justify-center gap-2">
										{isPosting && <Loader2 className="h-5 w-5 animate-spin" />}
										{isPosting
											? isEditMode
												? t("right_now.updating")
												: t("right_now.starting_session")
											: isEditMode
											? t("right_now.update_now")
											: t("right_now.start_now")}
									</div>
									<div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
								</button>

								{isEditMode && rightNowTestMode && (
									<button
										type="button"
										onClick={handleEndSession}
										disabled={isEnding || isPosting}
										className="mt-3 w-full rounded-2xl border border-red-500/30 bg-red-500/10 py-3 text-center font-semibold text-red-500 transition-all active:scale-[0.98] disabled:opacity-50"
									>
										{isEnding ? (
											<div className="flex items-center justify-center gap-2">
												<Loader2 className="h-4 w-4 animate-spin" />
												{t("right_now.ending_session")}
											</div>
										) : (
											t("right_now.end_session")
										)}
									</button>
								)}
							</div>
						)}

						{/* Debug Info Box - Visible when Developer Mode is on. Explicitly z-20 to stay above the background glow. */}
						{developerMode && showDebugInfo && (
							<div className="relative z-20 mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 font-mono text-[10px] text-blue-500">
								<div className="mb-2 flex items-center justify-between border-b border-blue-500/20 pb-1">
									<div
										className="font-bold uppercase tracking-wider cursor-pointer select-none"
										onClick={() => setDebugClickCount(prev => prev + 1)}
									>
										Debug Controls
									</div>
									{debugClickCount >= 5 && (
										<div className="flex gap-1.5">
											<button
												onClick={() => void setPreferences({ rightNowRemaining: Math.max(0, rightNowRemaining - 1) })}
												className="flex h-5 items-center justify-center rounded bg-blue-500/20 px-2 font-bold hover:bg-blue-500/30 active:scale-90"
											>
												-1
											</button>
											<button
												onClick={() => void setPreferences({ rightNowRemaining: rightNowRemaining + 1 })}
												className="flex h-5 items-center justify-center rounded bg-blue-500/20 px-2 font-bold hover:bg-blue-500/30 active:scale-90"
											>
												+1
											</button>
										</div>
									)}
								</div>

								{debugClickCount >= 5 && (
									<div className="mb-3 space-y-2 border-b border-blue-500/20 pb-3">
										<div className="flex gap-2">
											<input
												type="text"
												placeholder="Active ID"
												value={debugId}
												onChange={(e) => setDebugId(e.target.value)}
												className="w-1/2 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 outline-none placeholder:text-blue-500/40"
											/>
											<input
												type="text"
												placeholder="Expires At"
												value={debugExpires}
												onChange={(e) => setDebugExpires(e.target.value)}
												className="w-1/2 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 outline-none placeholder:text-blue-500/40"
											/>
										</div>
										<button
											onClick={() => {
												const id = parseInt(debugId);
												const expires = parseInt(debugExpires);
												if (!isNaN(id) && !isNaN(expires)) {
													void setPreferences({
														activeRightNowId: id,
														activeRightNowExpiresAt: expires
													});
													toast.success("Debug state forced");
												} else {
													toast.error("Invalid ID or Expiration");
												}
											}}
											className="w-full rounded bg-blue-500/20 py-1 font-bold hover:bg-blue-500/30 active:scale-[0.98]"
										>
											Apply Debug State
										</button>
									</div>
								)}

								<div className="grid grid-cols-2 gap-2">
									<div>Remaining: {rightNowRemaining}</div>
									<div>isEditMode: {isEditMode ? "YES" : "NO"}</div>
									<div>Active ID: {activeRightNowId || "None"}</div>
								</div>
								{isEditMode && debugInfo && (
									<div className="mt-2 border-t border-blue-500/20 pt-2">
										<div className="mb-1 opacity-70">Fetched at: {debugInfo.time}</div>
										<pre className="overflow-x-auto whitespace-pre-wrap max-h-40">
											{JSON.stringify(debugInfo.data, null, 2)}
										</pre>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
