import AgoraRTC, {
	type IAgoraRTCClient,
	type IAgoraRTCRemoteUser,
	type ICameraVideoTrack,
	type IMicrophoneAudioTrack,
	type IRemoteAudioTrack,
	type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import { appLog } from "../utils/logger";

// Agora's client.join() needs an App ID separate from the per-call RTC token
// returned by POST /v1/video-call — not present anywhere in that response.
// Recovered from the real Grindr Android app's decompiled RtcEngineConfig init.
const AGORA_APP_ID = "fb9ba023bdf9430b8f75856a1bb011b9";

// Some WebKitGTK builds (confirmed on Fedora 44's webkit2gtk4.1 2.52.3, even
// in GNOME Web) ship without the RTCPeerConnection DOM binding at all, no
// matter what WebKitSettings flags the host app sets — Agora's SDK doesn't
// surface this until deep inside an unhandled async rejection, and the call
// otherwise looks "connected" (signaling succeeds) with no actual media.
// Check up front so the user gets a clear error instead of a silent no-op call.
export class WebRtcUnsupportedError extends Error {
	constructor() {
		super("RTCPeerConnection is not available in this WebView");
		this.name = "WebRtcUnsupportedError";
	}
}

export function isWebRtcSupported(): boolean {
	return typeof RTCPeerConnection !== "undefined";
}

export interface AgoraCallHandlers {
	onRemoteVideoTrack: (track: IRemoteVideoTrack) => void;
	onRemoteAudioTrack: (track: IRemoteAudioTrack) => void;
	// Fires as soon as the other side's Agora client actually joins the
	// channel — a real, protocol-level "they connected" signal, unlike the
	// backend's REST/WS API which never confirms the callee answered. This is
	// also the one that fires for a peer already in the channel by the time
	// we join, not just ones that join afterward.
	onRemoteUserJoined?: (user: IAgoraRTCRemoteUser) => void;
	onRemoteUserLeft?: (user: IAgoraRTCRemoteUser) => void;
	// Fires when the remote side mutes/unmutes their camera via
	// track.setMuted() — what this app's own handleToggleCamera uses. Not the
	// same as user-published/user-unpublished, which only fire when a track
	// is actually published/unpublished, not when an already-published one is
	// muted — so a toggled-off remote camera is only observable this way.
	onRemoteVideoMuteChanged?: (muted: boolean) => void;
}

export class AgoraCallSession {
	private client: IAgoraRTCClient;
	private micTrack: IMicrophoneAudioTrack | null = null;
	private camTrack: ICameraVideoTrack | null = null;

	constructor(private readonly handlers: AgoraCallHandlers) {
		// The real app calls setChannelProfile(1) (LIVE_BROADCASTING) rather than
		// the default COMMUNICATION profile — the Web SDK equivalent is
		// mode: "live", which requires an explicit client role since only
		// "host" (not the default "audience") is allowed to publish.
		this.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
		this.client.on("user-joined", (user) => {
			this.handlers.onRemoteUserJoined?.(user);
		});
		this.client.on("user-published", async (user, mediaType) => {
			await this.client.subscribe(user, mediaType);
			if (mediaType === "video" && user.videoTrack) {
				this.handlers.onRemoteVideoTrack(user.videoTrack);
			}
			if (mediaType === "audio" && user.audioTrack) {
				this.handlers.onRemoteAudioTrack(user.audioTrack);
				user.audioTrack.play();
			}
		});
		this.client.on("user-left", (user) => {
			this.handlers.onRemoteUserLeft?.(user);
		});
		this.client.on("user-info-updated", (_uid, msg) => {
			if (msg === "mute-video") this.handlers.onRemoteVideoMuteChanged?.(true);
			else if (msg === "unmute-video") this.handlers.onRemoteVideoMuteChanged?.(false);
		});
	}

	// uid must be our own numeric Grindr profileId, not left to auto-assign —
	// the RTC token the backend issues is bound to that specific uid, and
	// joining with a different/null uid fails with CAN_NOT_GET_GATEWAY_SERVER
	// ("invalid token, authorized failed") even though the token itself and
	// channel name are correct.
	async join(channelId: string, token: string, uid: number): Promise<void> {
		if (!isWebRtcSupported()) {
			throw new WebRtcUnsupportedError();
		}
		await this.client.setClientRole("host");
		await this.client.join(AGORA_APP_ID, channelId, token, uid);
		[this.micTrack, this.camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
		await this.client.publish([this.micTrack, this.camTrack]);
	}

	getLocalVideoTrack(): ICameraVideoTrack | null {
		return this.camTrack;
	}

	// Feeds a freshly renewed Agora token (from PATCH /v1/video-call) into the
	// already-connected client — keeps the media stream running uninterrupted,
	// unlike join() which would tear down and re-establish the connection.
	async renewToken(token: string): Promise<void> {
		await this.client.renewToken(token);
	}

	setMicMuted(muted: boolean): void {
		this.micTrack?.setMuted(muted);
	}

	setCameraMuted(muted: boolean): void {
		this.camTrack?.setMuted(muted);
	}

	async leave(): Promise<void> {
		try {
			this.micTrack?.close();
			this.camTrack?.close();
			this.micTrack = null;
			this.camTrack = null;
			await this.client.leave();
		} catch (error) {
			appLog.warn("[agora-call] error leaving channel", error);
		}
	}
}
