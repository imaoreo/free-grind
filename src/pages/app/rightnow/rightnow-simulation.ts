import type { RightNowCreatePostRequest, RightNowUpdatePostRequest } from "../../../services/apiFunctions";
import { getRightNowSessionDuration } from "./rightnow-constants";

export async function simulateFetchActivePost(
	text: string,
	isHosting: boolean,
	showOnMap: boolean,
	mediaId: number | null,
	thumbnailUrl: string | null,
	isHidden: boolean,
) {
	console.log("Simulating GET Active RightNow Post");
	await new Promise((resolve) => setTimeout(resolve, 800));

	return {
		post: {
			activeText: text || "This is a simulated active post",
			hosting: isHosting,
			postStatus: isHidden ? "HIDDEN" : "ACTIVE",
			shareLocation: showOnMap ? "DISTANCE_AND_MAP" : "DISTANCE_ONLY",
			media: mediaId ? [{ data: { mediaId, thumbnailUrl } }] : [],
		},
	};
}

export async function simulateCreatePost(payload: RightNowCreatePostRequest) {
	console.log("Simulating POST RightNow Post:", payload);
	await new Promise((resolve) => setTimeout(resolve, 1500));

	const mockId = Math.floor(Math.random() * 1000000);
	const mockExpiration = Date.now() + getRightNowSessionDuration(true);

	return {
		id: mockId,
		expiresAt: mockExpiration,
	};
}

export async function simulateUpdatePost(id: number, payload: RightNowUpdatePostRequest) {
	console.log("Simulating PATCH RightNow Post:", id, payload);
	await new Promise((resolve) => setTimeout(resolve, 1500));
	return { success: true };
}

export async function simulateEndSession(id: number) {
	console.log("Simulating DELETE RightNow Post:", id);
	await new Promise((resolve) => setTimeout(resolve, 1000));
	return { success: true };
}

export async function simulateUploadMedia(file: File) {
	console.log("Simulating RightNow Media Upload:", file.name);
	await new Promise((resolve) => setTimeout(resolve, 1200));

	return {
		mediaId: Math.floor(Math.random() * 1000000),
		thumbnailUrl: URL.createObjectURL(file), // Use the actual file for preview
	};
}
