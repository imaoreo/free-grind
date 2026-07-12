import toast from "react-hot-toast";
import type { TFunction } from "i18next";
import { isIos, saveMediaBatch } from "../services/saveMedia";
import { albumViewerFolderKey, type AlbumViewer } from "../types/shared-albums";
import { appLog } from "./logger";

export async function saveAllAlbumMedia(viewer: AlbumViewer, t: TFunction): Promise<void> {
	const items = viewer.content
		.map((item) => ({
			url: item.url || item.coverUrl,
			type: (item.contentType?.startsWith("video/") ? "video" : "image") as "image" | "video",
		}))
		.filter((item): item is { url: string; type: "image" | "video" } => !!item.url);

	if (items.length === 0) {
		toast.error(t("profile_details.save_all_empty"));
		return;
	}

	const toastId = toast.loading(
		t("profile_details.save_all_progress", { done: 0, total: items.length }),
	);
	try {
		const result = await saveMediaBatch(items, (done, total) => {
			toast.loading(t("profile_details.save_all_progress", { done, total }), { id: toastId });
		}, albumViewerFolderKey(viewer));

		if (result.failed === 0) {
			toast.success(
				t(
					isIos() ? "profile_details.save_all_success" : "profile_details.save_all_success_downloads",
					{ count: result.succeeded },
				),
				{ id: toastId },
			);
		} else {
			toast.error(
				t("profile_details.save_all_partial", {
					succeeded: result.succeeded,
					total: result.total,
					failed: result.failed,
				}),
				{ id: toastId },
			);
		}
	} catch (error) {
		appLog.error("[saveAllAlbumMedia] Save all failed", error);
		toast.error(
			t(isIos() ? "profile_details.save_all_error" : "profile_details.save_all_error_downloads"),
			{ id: toastId },
		);
	}
}
