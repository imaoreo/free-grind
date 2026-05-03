import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import type { AlbumViewer } from "../../../types/shared-albums";

type AlbumContent = AlbumViewer["content"][number];

type AlbumFullscreenOverlayProps = {
	viewer: AlbumViewer;
	fullScreenIndex: number | null;
	fullScreenItem: AlbumContent;
	canViewPrevious: boolean;
	canViewNext: boolean;
	closeFullScreen: () => void;
	showPreviousFullScreenItem: () => void;
	showNextFullScreenItem: () => void;
	onViewerTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
	onViewerTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => void;
};

export function AlbumFullscreenOverlay({
	viewer,
	fullScreenIndex,
	fullScreenItem,
	canViewPrevious,
	canViewNext,
	closeFullScreen,
	showPreviousFullScreenItem,
	showNextFullScreenItem,
	onViewerTouchStart,
	onViewerTouchEnd,
}: AlbumFullscreenOverlayProps) {
	const { t } = useTranslation();

	const mediaUrl =
		fullScreenItem.url ||
		fullScreenItem.thumbUrl ||
		fullScreenItem.coverUrl;

	return (
		<div className="fixed inset-0 z-[60] bg-black/90" onClick={closeFullScreen}>
			<div
				className="flex h-full w-full items-center justify-center p-3 sm:p-6"
				onTouchStart={onViewerTouchStart}
				onTouchEnd={onViewerTouchEnd}
			>
				<div className="flex h-full w-full max-h-[92vh] max-w-[92vw] items-center justify-center">
					{(() => {
						if (!mediaUrl) {
							return (
								<div className="rounded-xl bg-black/50 px-6 py-4 text-center text-sm text-white/80">
									{t("shared_albums.media_unavailable")}
								</div>
							);
						}

						if (fullScreenItem.contentType?.startsWith("video/")) {
							return (
								<video
									src={mediaUrl}
									controls
									autoPlay
									onClick={(event) => event.stopPropagation()}
									className="h-full w-full max-h-[92vh] max-w-[92vw] object-contain"
								/>
							);
						}

						return (
							<img
								src={mediaUrl}
								alt={t("shared_albums.content_alt", { index: (fullScreenIndex ?? 0) + 1 })}
								onClick={(event) => event.stopPropagation()}
								className="h-full w-full max-h-[92vh] max-w-[92vw] object-contain"
							/>
						);
					})()}
				</div>

				<Button
					type="button"
					size="icon"
					variant="secondary"
					onClick={(event) => {
						event.stopPropagation();
						closeFullScreen();
					}}
					aria-label={t("shared_albums.close_fullscreen")}
					className="absolute"
					style={{
						right: "calc(env(safe-area-inset-right, 0px) + 12px)",
						top: "calc(env(safe-area-inset-top, 0px) + 12px)",
					}}
				>
					<X className="h-5 w-5" />
				</Button>

				{viewer.content.length > 1 ? (
					<>
						<Button
							type="button"
							size="icon"
							variant="secondary"
							onClick={(event) => {
								event.stopPropagation();
								showPreviousFullScreenItem();
							}}
							disabled={!canViewPrevious}
							aria-label={t("shared_albums.previous")}
							className="absolute left-3 top-1/2 hidden -translate-y-1/2 sm:left-5 sm:inline-flex"
						>
							<ChevronLeft className="h-6 w-6" />
						</Button>
						<Button
							type="button"
							size="icon"
							variant="secondary"
							onClick={(event) => {
								event.stopPropagation();
								showNextFullScreenItem();
							}}
							disabled={!canViewNext}
							aria-label={t("shared_albums.next")}
							className="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:right-5 sm:inline-flex"
						>
							<ChevronRight className="h-6 w-6" />
						</Button>

						<div className="absolute bottom-4 left-3 right-3 grid grid-cols-2 gap-2 sm:hidden">
							<Button
								type="button"
								variant="secondary"
								onClick={(event) => {
									event.stopPropagation();
									showPreviousFullScreenItem();
								}}
								disabled={!canViewPrevious}
								className="w-full"
							>
								{t("shared_albums.previous")}
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={(event) => {
									event.stopPropagation();
									showNextFullScreenItem();
								}}
								disabled={!canViewNext}
								className="w-full"
							>
								{t("shared_albums.next")}
							</Button>
						</div>
					</>
				) : null}

				<div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 sm:bottom-3">
					{(fullScreenIndex ?? 0) + 1} / {viewer.content.length}
				</div>
			</div>
		</div>
	);
}
