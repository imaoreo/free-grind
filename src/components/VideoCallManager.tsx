/**
 * VideoCallManager — app-wide singleton (mounted once in App.tsx, alongside
 * ChatRealtimeBridge) that owns the video-call state machine so an incoming
 * call can surface from any screen, not just an open chat thread.
 *
 * Follows the same pushState/popstate pattern as other full-screen overlays
 * in this app (see LocationOverlay.tsx) for Android hardware back-button
 * support — but unlike those, hanging up on back is intentional here: a call
 * has real backend state (PATCH /v1/video-call/leave) that must be cleaned
 * up, not just a UI dismissal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import { useAuth } from "../contexts/useAuth";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useMyOwnProfile } from "../hooks/queries/useProfileQueries";
import {
	useVideoCallRemainingSeconds,
	useRefreshVideoCallRemainingSeconds,
} from "../hooks/queries/useVideoCallQueries";
import { ProfileImage } from "./ui/profile-image";
import {
	VIDEO_CALL_INCOMING_EVENT,
	VIDEO_CALL_ENDED_EVENT,
	type VideoCallIncomingDetail,
	type VideoCallEndedDetail,
} from "./ChatRealtimeBridge";
import { AgoraCallSession, WebRtcUnsupportedError, isWebRtcSupported } from "../services/agoraCall";
import { getProfileImageUrl } from "../utils/media";
import { appLog } from "../utils/logger";
import { isAndroid, isIos } from "../services/saveMedia";
import { ApiFunctionError } from "../services/apiHelpers";

type CallPhase = "idle" | "outgoing-ringing" | "incoming-ringing" | "active";

// Maps the video-call result code — however it arrives (a 2xx body whose
// `result` field isn't "SUCCESS", the payload of a non-2xx ApiFunctionError,
// or the videocall.v1.call_ended WS event) — to the right toast copy.
// TARGET_PROFILE_UNAVAILABLE is the confirmed "target is on another call"
// code (there's no separate "BUSY" value despite what it sounds like).
function getVideoCallResultMessage(
	rawResult: string | null | undefined,
	fallbackKey: string,
	t: (key: string) => string,
): string {
	const normalized = rawResult?.toUpperCase();
	if (normalized === "EXCEED_LENGTH_LIMIT") return t("video_call.limit_reached");
	if (normalized === "TARGET_PROFILE_UNAVAILABLE") return t("video_call.busy");
	return t(fallbackKey);
}

// startVideoCall's soft-failure result code, if this error actually came
// from assertSuccess() rejecting a non-2xx response whose JSON body still
// carried one (confirmed: the server sometimes returns these as real HTTP
// errors rather than a 2xx body with result !== "SUCCESS").
function extractResultFromApiError(error: unknown): string | null {
	if (!(error instanceof ApiFunctionError)) return null;
	if (!error.payload || typeof error.payload !== "object") return null;
	const result = (error.payload as Record<string, unknown>).result;
	return typeof result === "string" ? result : null;
}

interface CallInfo {
	channelId: string;
	token: string | null;
	otherProfileId: string;
	displayName: string;
	imageHash: string | null;
	maxSeconds: number;
}

const HISTORY_MODAL_KEY = "video-call";

function formatElapsed(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60);
	const s = Math.floor(totalSeconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

let outgoingCallTrigger:
	| ((targetProfileId: string, displayName: string, imageHash: string | null) => void)
	| null = null;

export function startOutgoingCall(
	targetProfileId: string,
	displayName: string,
	imageHash: string | null = null,
): void {
	if (!outgoingCallTrigger) {
		appLog.warn("[video-call] startOutgoingCall called before VideoCallManager mounted");
		return;
	}
	outgoingCallTrigger(targetProfileId, displayName, imageHash);
}

export function VideoCallManager() {
	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const { t } = useTranslation();
	const { data: ownProfile } = useMyOwnProfile(true);
	// Front/back camera switching only makes sense on phones — desktop
	// webcams have no "environment"-facing device for setDevice() to find.
	const [isMobilePlatform] = useState(() => isAndroid() || isIos());
	// Fetched once (after auth/profile is ready) and cached — refreshed only
	// after a call ends, not on every screen/conversation.
	useVideoCallRemainingSeconds(true);
	const refreshVideoCallRemainingSeconds = useRefreshVideoCallRemainingSeconds();
	const ownAvatarUrl = ownProfile?.profileImageMediaHash
		? getProfileImageUrl(ownProfile.profileImageMediaHash, "480x480")
		: null;

	const [phase, setPhase] = useState<CallPhase>("idle");
	const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
	const [micMuted, setMicMuted] = useState(false);
	// Which tile is currently full-screen — tapping the small picture-in-
	// picture tile swaps it, same as FaceTime/WhatsApp.
	const [isLocalMain, setIsLocalMain] = useState(false);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [cameraOff, setCameraOff] = useState(false);
	// Mirrors the remote side's own camera-off state (via Agora's
	// user-info-updated mute-video/unmute-video), so we can show their avatar
	// in place of a frozen/black frame the same way we do for our own tile.
	const [remoteCameraOff, setRemoteCameraOff] = useState(false);
	// Which corner the small PiP tile is currently docked to — draggable,
	// snaps to the nearest corner on release (same idea as iOS FaceTime).
	const [pipCorner, setPipCorner] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right">(
		"bottom-right",
	);
	// Live position while actively dragging (viewport px); null when docked.
	const [pipDragPos, setPipDragPos] = useState<{ x: number; y: number } | null>(null);
	const pipDragStateRef = useRef<{ startClientX: number; startClientY: number; startLeft: number; startTop: number; moved: boolean } | null>(null);

	const phaseRef = useRef(phase);
	useEffect(() => {
		phaseRef.current = phase;
	}, [phase]);

	// Local elapsed-time counter for the active-call UI — starts fresh each
	// time this client's Agora session actually connects, not tied to the
	// server's own duration accounting (that only arrives after the fact, in
	// the videocall.v1.call_ended event's `duration` field).
	useEffect(() => {
		if (phase !== "active") {
			setElapsedSeconds(0);
			return;
		}
		const intervalId = window.setInterval(() => {
			setElapsedSeconds((prev) => prev + 1);
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [phase]);

	const callInfoRef = useRef(callInfo);
	useEffect(() => {
		callInfoRef.current = callInfo;
	}, [callInfo]);

	const apiFunctionsRef = useRef(apiFunctions);
	useEffect(() => {
		apiFunctionsRef.current = apiFunctions;
	}, [apiFunctions]);

	const tRef = useRef(t);
	useEffect(() => {
		tRef.current = t;
	}, [t]);

	const userIdRef = useRef(userId);
	useEffect(() => {
		userIdRef.current = userId;
	}, [userId]);

	const sessionRef = useRef<AgoraCallSession | null>(null);
	const closingRef = useRef(false);
	const localVideoRef = useRef<HTMLDivElement | null>(null);
	const remoteVideoRef = useRef<HTMLDivElement | null>(null);

	// Agora token keep-alive — the initial token is only valid for maxSeconds
	// (60s in the documented example), so a long call needs it periodically
	// renewed via PATCH /v1/video-call and fed into the live connection via
	// renewToken(), never by re-joining. Mirrors the real app's
	// VideoCallForegroundService: schedule the next renewal at
	// remainingSeconds - refreshSeconds (the server-recommended lead time,
	// observed as 300s/5min), or immediately if less than that remains.
	const renewTimeoutRef = useRef<number | null>(null);
	const performRenewalRef = useRef<(() => Promise<void>) | null>(null);

	const clearRenewTimer = useCallback(() => {
		if (renewTimeoutRef.current != null) {
			window.clearTimeout(renewTimeoutRef.current);
			renewTimeoutRef.current = null;
		}
	}, []);

	const scheduleRenewal = useCallback(
		(remainingSeconds: number, refreshSeconds: number) => {
			clearRenewTimer();
			const delayMs = Math.max(remainingSeconds - refreshSeconds, 0) * 1000;
			renewTimeoutRef.current = window.setTimeout(() => {
				void performRenewalRef.current?.();
			}, delayMs);
		},
		[clearRenewTimer],
	);

	const performRenewal = useCallback(async () => {
		try {
			const result = await apiFunctionsRef.current.extendVideoCall();
			if (result.result !== "SUCCESS" || !result.token || result.remainingSeconds == null) {
				// Matches the real app's behavior: log and let the call end
				// naturally once the current token actually expires, rather
				// than tearing it down proactively on a renewal failure.
				appLog.warn("[video-call] token renewal did not succeed", result);
				return;
			}
			await sessionRef.current?.renewToken(result.token);
			scheduleRenewal(result.remainingSeconds, result.refreshSeconds ?? 300);
		} catch (error) {
			appLog.warn("[video-call] token renewal request failed", error);
		}
	}, [scheduleRenewal]);

	useEffect(() => {
		performRenewalRef.current = performRenewal;
	}, [performRenewal]);

	// Kick off the renewal cycle once the call is actually connected, using
	// the initial maxSeconds from startVideoCall/joinVideoCall as the first
	// deadline; stop it as soon as the call is no longer active.
	useEffect(() => {
		if (phase !== "active") {
			clearRenewTimer();
			return;
		}
		scheduleRenewal(callInfoRef.current?.maxSeconds ?? 60, 300);
		return () => clearRenewTimer();
	}, [phase, scheduleRenewal, clearRenewTimer]);

	const endCall = useCallback(async (options?: { fromHardwareBack?: boolean }) => {
		if (closingRef.current) return;
		closingRef.current = true;
		clearRenewTimer();
		try {
			await sessionRef.current?.leave();
			sessionRef.current = null;
			const channelId = callInfoRef.current?.channelId;
			if (channelId) {
				await apiFunctionsRef.current.leaveVideoCall(channelId).catch(() => {});
			}
		} finally {
			setPhase("idle");
			setCallInfo(null);
			setMicMuted(false);
			setCameraOff(false);
			setRemoteCameraOff(false);
			setIsLocalMain(false);
			// A call may have just consumed some of the account's daily/monthly
			// allowance — refresh the cached remaining-seconds value now rather
			// than on every conversation open.
			void refreshVideoCallRemainingSeconds();
			if (!options?.fromHardwareBack && window.history.state?.modal === HISTORY_MODAL_KEY) {
				window.history.back();
			}
			closingRef.current = false;
		}
	}, [refreshVideoCallRemainingSeconds, clearRenewTimer]);
	const endCallRef = useRef(endCall);
	useEffect(() => {
		endCallRef.current = endCall;
	}, [endCall]);

	// waitForRemoteJoin: the caller side has no way to know the callee
	// answered other than Agora's own "user-joined" event (no confirmed
	// backend signal for it) — so the caller stays on the ringing screen,
	// with the elapsed timer not yet running, until that fires. The callee
	// side already made a deliberate "accept" decision, so it goes straight
	// to active once its own join succeeds.
	const joinAgoraSession = useCallback(async (channelId: string, token: string, waitForRemoteJoin: boolean) => {
		if (userIdRef.current == null) {
			toast.error(tRef.current("video_call.connection_failed"));
			await endCallRef.current();
			return;
		}
		// isWebRtcSupported() is also checked inside session.join() itself, but
		// AgoraRTC.createClient() (run by the AgoraCallSession constructor,
		// below) can throw synchronously on WebViews missing RTCPeerConnection
		// entirely — checking here first means we never even construct it, and
		// everything that follows is safely inside the try/catch instead of a
		// bare `new AgoraCallSession(...)` above it that could throw uncaught.
		try {
			if (!isWebRtcSupported()) {
				throw new WebRtcUnsupportedError();
			}
			const session = new AgoraCallSession({
				onRemoteVideoTrack: (track) => {
					if (remoteVideoRef.current) track.play(remoteVideoRef.current);
				},
				onRemoteAudioTrack: () => {
					// AgoraCallSession already plays remote audio directly.
				},
				onRemoteUserJoined: () => {
					if (waitForRemoteJoin) setPhase("active");
				},
				onRemoteVideoMuteChanged: (muted) => {
					setRemoteCameraOff(muted);
				},
			});
			await session.join(channelId, token, userIdRef.current);
			sessionRef.current = session;
			const localTrack = session.getLocalVideoTrack();
			if (localTrack && localVideoRef.current) {
				localTrack.play(localVideoRef.current);
			}
			if (!waitForRemoteJoin) setPhase("active");
		} catch (error) {
			appLog.warn("[video-call] failed to join Agora session", error);
			toast.error(
				error instanceof WebRtcUnsupportedError
					? tRef.current("video_call.webrtc_unsupported")
					: tRef.current("video_call.connection_failed"),
			);
			await endCallRef.current();
		}
	}, []);

	// Outgoing call, triggered from ChatThreadPanel's header menu.
	const handleStartOutgoing = useCallback(
		(targetProfileId: string, displayName: string, imageHash: string | null) => {
			if (phaseRef.current !== "idle") return;
			void (async () => {
				// No separate remaining-allowance pre-check here — the menu item
				// that triggers this is already disabled once ChatThreadPanel's own
				// getVideoCallInfo check shows the account is exhausted, and
				// startVideoCall's own EXCEED_LENGTH_LIMIT result (handled below)
				// is the authoritative source of truth anyway.
				setCallInfo({
					channelId: "",
					token: null,
					otherProfileId: targetProfileId,
					displayName,
					imageHash,
					maxSeconds: 60,
				});
				setPhase("outgoing-ringing");
				try {
					const result = await apiFunctionsRef.current.startVideoCall(Number(targetProfileId));
					// A limit hit / busy target comes back as an HTTP 2xx with
					// result !== "SUCCESS" and channelId/token/maxSeconds all
					// null — not an HTTP error, so assertSuccess() lets it
					// through. Catch it here rather than crashing
					// joinAgoraSession on a null token.
					if (result.result?.toUpperCase() !== "SUCCESS" || !result.channelId || !result.token) {
						toast.error(
							getVideoCallResultMessage(result.result, "video_call.start_failed", tRef.current),
							{ duration: 6000 },
						);
						await endCallRef.current();
						return;
					}
					setCallInfo((prev) =>
						prev
							? { ...prev, channelId: result.channelId!, token: result.token!, maxSeconds: result.maxSeconds ?? prev.maxSeconds }
							: prev,
					);
					// Join our own Agora session right away so we're ready the
					// instant the callee answers, but stay on the ringing screen
					// until Agora's "user-joined" actually fires for them.
					await joinAgoraSession(result.channelId, result.token, true);
				} catch (error) {
					appLog.warn("[video-call] startVideoCall failed", error);
					// TARGET_PROFILE_UNAVAILABLE/EXCEED_LENGTH_LIMIT sometimes arrive
					// as a real HTTP error (assertSuccess throws) rather than a 2xx
					// body with result !== "SUCCESS" — check the error payload too
					// instead of always falling back to the generic message.
					toast.error(
						getVideoCallResultMessage(extractResultFromApiError(error), "video_call.start_failed", tRef.current),
						{ duration: 6000 },
					);
					await endCallRef.current();
				}
			})();
		},
		[joinAgoraSession],
	);

	useEffect(() => {
		outgoingCallTrigger = handleStartOutgoing;
		return () => {
			outgoingCallTrigger = null;
		};
	}, [handleStartOutgoing]);

	// Incoming call, pushed over the chat WebSocket.
	useEffect(() => {
		const handleIncoming = (event: Event) => {
			const detail = (event as CustomEvent<VideoCallIncomingDetail>).detail;
			if (!detail || phaseRef.current !== "idle") return;
			setCallInfo({
				channelId: detail.channelId,
				token: null,
				otherProfileId: detail.senderId,
				displayName: tRef.current("common.unknown_display_name"),
				imageHash: null,
				maxSeconds: 60,
			});
			setPhase("incoming-ringing");
			void apiFunctionsRef.current
				.getProfileDetail(detail.senderId)
				.then((profile) => {
					setCallInfo((prev) =>
						prev && prev.channelId === detail.channelId
							? {
									...prev,
									displayName: profile.displayName?.trim() || prev.displayName,
									imageHash: profile.profileImageMediaHash ?? null,
								}
							: prev,
					);
				})
				.catch(() => {});
		};

		const handleEnded = (event: Event) => {
			const detail = (event as CustomEvent<VideoCallEndedDetail>).detail;
			if (!detail || phaseRef.current === "idle") return;
			if (callInfoRef.current?.channelId && callInfoRef.current.channelId !== detail.channelId) return;
			// Confirmed result values: UNANSWERED (no pickup), DECLINED (other side
			// rejected), SUCCESSFUL (a normal call that was answered and ended),
			// TARGET_PROFILE_UNAVAILABLE (target already on another call).
			const normalizedResult = detail.result?.toUpperCase();
			const message =
				normalizedResult === "UNANSWERED"
					? tRef.current("video_call.call_ended_unanswered")
					: normalizedResult === "DECLINED"
						? tRef.current("video_call.call_declined")
						: getVideoCallResultMessage(detail.result, "video_call.call_ended_generic", tRef.current);
			toast(message);
			void endCallRef.current();
		};

		window.addEventListener(VIDEO_CALL_INCOMING_EVENT, handleIncoming);
		window.addEventListener(VIDEO_CALL_ENDED_EVENT, handleEnded);
		return () => {
			window.removeEventListener(VIDEO_CALL_INCOMING_EVENT, handleIncoming);
			window.removeEventListener(VIDEO_CALL_ENDED_EVENT, handleEnded);
		};
	}, []);

	// Hardware back button hangs up / declines, rather than just dismissing.
	useEffect(() => {
		const onPopState = (event: PopStateEvent) => {
			if (phaseRef.current !== "idle" && event.state?.modal !== HISTORY_MODAL_KEY) {
				void endCallRef.current({ fromHardwareBack: true });
			}
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	useEffect(() => {
		if (phase !== "idle" && window.history.state?.modal !== HISTORY_MODAL_KEY) {
			window.history.pushState({ modal: HISTORY_MODAL_KEY }, "");
		}
	}, [phase]);

	// Reset if the account changes mid-call (e.g. sign-out).
	useEffect(() => {
		if (userId == null && phaseRef.current !== "idle") {
			void endCall();
		}
	}, [userId, endCall]);

	const handleAccept = useCallback(async () => {
		const info = callInfoRef.current;
		if (!info) return;
		try {
			const joinResult = await apiFunctionsRef.current.joinVideoCall(info.channelId);
			let token = joinResult.token;
			if (!token) {
				try {
					const fallbackInfo = await apiFunctionsRef.current.getVideoCallInfo();
					if (fallbackInfo && typeof fallbackInfo === "object") {
						const maybeToken = (fallbackInfo as Record<string, unknown>).token;
						if (typeof maybeToken === "string") token = maybeToken;
					}
				} catch {
					// Best-effort fallback only — fall through to the error below.
				}
			}
			if (!token) {
				toast.error(tRef.current("video_call.connection_failed"));
				await endCall();
				return;
			}
			await joinAgoraSession(info.channelId, token, false);
		} catch (error) {
			appLog.warn("[video-call] joinVideoCall failed", error);
			toast.error(tRef.current("video_call.join_failed"));
			await endCall();
		}
	}, [endCall, joinAgoraSession]);

	const handleToggleMic = useCallback(() => {
		setMicMuted((prev) => {
			sessionRef.current?.setMicMuted(!prev);
			return !prev;
		});
	}, []);

	const handleToggleCamera = useCallback(() => {
		setCameraOff((prev) => {
			sessionRef.current?.setCameraMuted(!prev);
			return !prev;
		});
	}, []);

	const handleSwitchCamera = useCallback(async () => {
		try {
			await sessionRef.current?.switchCamera();
		} catch (error) {
			appLog.warn("[video-call] switchCamera failed", error);
			toast.error(tRef.current("video_call.switch_camera_failed"));
		}
	}, []);

	// PiP tile drag-to-dock. A plain onClick would double-fire alongside the
	// drag gesture (a tap is just a pointerdown+pointerup with no movement),
	// so tap-to-swap is handled here too, only when the pointer never moved
	// past a small threshold — otherwise the movement is a drag.
	const DRAG_THRESHOLD_PX = 6;

	const handlePipPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		pipDragStateRef.current = {
			startClientX: event.clientX,
			startClientY: event.clientY,
			startLeft: rect.left,
			startTop: rect.top,
			moved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}, []);

	const handlePipPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const drag = pipDragStateRef.current;
		if (!drag) return;
		const dx = event.clientX - drag.startClientX;
		const dy = event.clientY - drag.startClientY;
		if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
			drag.moved = true;
		}
		if (drag.moved) {
			setPipDragPos({ x: drag.startLeft + dx, y: drag.startTop + dy });
		}
	}, []);

	const handlePipPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const drag = pipDragStateRef.current;
		pipDragStateRef.current = null;
		if (!drag) return;
		if (!drag.moved) {
			// A genuine tap (no drag) — swap main/PiP as before.
			setIsLocalMain((prev) => !prev);
			return;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const isRight = centerX > window.innerWidth / 2;
		const isBottom = centerY > window.innerHeight / 2;
		setPipCorner(isBottom ? (isRight ? "bottom-right" : "bottom-left") : isRight ? "top-right" : "top-left");
		setPipDragPos(null);
	}, []);

	// If the gesture is interrupted (e.g. an OS gesture takes over), snap back
	// to the last docked corner rather than leaving the tile stranded mid-drag.
	const handlePipPointerCancel = useCallback(() => {
		pipDragStateRef.current = null;
		setPipDragPos(null);
	}, []);

	// Matches the h-28/h-40 (PIP_WIDTH/PIP_HEIGHT) tile size below. Always
	// expressed as left/top (never right/bottom, even for the right- or
	// bottom-docked corners) so every corner-to-corner transition animates
	// the exact same two CSS properties — mixing in right/bottom made the
	// browser jump-cut instead of tween whenever a property appeared/
	// disappeared between the dragged position and the docked one (most
	// noticeable snapping to the bottom corners, which used `bottom` while
	// dragging only ever sets `left`/`top`).
	const PIP_WIDTH = 112;
	const PIP_HEIGHT = 160;
	const PIP_MARGIN = 16;
	const PIP_BOTTOM_CLEARANCE = 128; // clears the active-call control row
	const PIP_TOP_LEFT_CLEARANCE = 88; // clears the top-left switch-camera button (mobile only)

	function getPipCornerStyle(corner: typeof pipCorner): React.CSSProperties {
		const left =
			corner === "top-left" || corner === "bottom-left"
				? `${PIP_MARGIN}px`
				: `calc(100% - ${PIP_WIDTH + PIP_MARGIN}px)`;
		const top =
			corner === "bottom-left" || corner === "bottom-right"
				? `calc(100% - ${PIP_HEIGHT}px - env(safe-area-inset-bottom, 0px) - ${PIP_BOTTOM_CLEARANCE}px)`
				: corner === "top-left" && isMobilePlatform
					? `calc(env(safe-area-inset-top, 0px) + ${PIP_TOP_LEFT_CLEARANCE}px)`
					: `calc(env(safe-area-inset-top, 0px) + ${PIP_MARGIN}px)`;
		return { left, top };
	}

	const pipStyle: React.CSSProperties = pipDragPos
		? { left: pipDragPos.x, top: pipDragPos.y }
		: { ...getPipCornerStyle(pipCorner), transition: "top 0.25s ease, left 0.25s ease" };

	if (phase === "idle" || !callInfo) return null;

	const avatarUrl = callInfo.imageHash ? getProfileImageUrl(callInfo.imageHash, "480x480") : null;

	// Matches the floating-control chrome already established for full-bleed
	// dark media surfaces elsewhere in the app (see PhotoViewer.tsx's
	// close/nav buttons and page-count pill) — hairline white border,
	// translucent black fill, backdrop blur — rather than the flat/generic
	// bg-white/15 this screen started with.
	const controlButtonClass =
		"flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md transition active:scale-90";
	const pillClass =
		"rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-md";

	return createPortal(
		<div className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-black text-white">
			{phase === "active" ? (
				<>
					<div
						ref={remoteVideoRef}
						onPointerDown={isLocalMain ? handlePipPointerDown : undefined}
						onPointerMove={isLocalMain ? handlePipPointerMove : undefined}
						onPointerUp={isLocalMain ? handlePipPointerUp : undefined}
						onPointerCancel={isLocalMain ? handlePipPointerCancel : undefined}
						style={isLocalMain ? pipStyle : undefined}
						className={
							isLocalMain
								? "absolute z-10 h-40 w-28 touch-none cursor-grab overflow-hidden rounded-xl border border-white/15 bg-neutral-900 shadow-lg active:cursor-grabbing"
								: "absolute inset-0 bg-neutral-900"
						}
					>
						{remoteCameraOff && <ProfileImage src={avatarUrl} className="absolute inset-0" />}
					</div>
					<div
						ref={localVideoRef}
						onPointerDown={!isLocalMain ? handlePipPointerDown : undefined}
						onPointerMove={!isLocalMain ? handlePipPointerMove : undefined}
						onPointerUp={!isLocalMain ? handlePipPointerUp : undefined}
						onPointerCancel={!isLocalMain ? handlePipPointerCancel : undefined}
						style={!isLocalMain ? pipStyle : undefined}
						className={
							isLocalMain
								? "absolute inset-0 bg-neutral-800"
								: "absolute z-10 h-40 w-28 touch-none cursor-grab overflow-hidden rounded-xl border border-white/15 bg-neutral-800 shadow-lg active:cursor-grabbing"
						}
					>
						{cameraOff && <ProfileImage src={ownAvatarUrl} className="absolute inset-0" />}
					</div>
					<div
						className={`absolute left-1/2 z-10 -translate-x-1/2 tabular-nums ${pillClass}`}
						style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
					>
						{formatElapsed(elapsedSeconds)}
					</div>
					{isMobilePlatform && (
						<button
							type="button"
							onClick={() => void handleSwitchCamera()}
							aria-label={t("video_call.switch_camera")}
							className={`absolute z-10 ${controlButtonClass}`}
							style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)", left: "1rem" }}
						>
							<SwitchCamera className="h-6 w-6" />
						</button>
					)}
					<div
						className="relative z-10 mt-auto flex w-full items-center justify-center gap-6"
						style={{ paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))" }}
					>
						<button
							type="button"
							onClick={handleToggleMic}
							aria-label={t(micMuted ? "video_call.unmute" : "video_call.mute")}
							className={controlButtonClass}
						>
							{micMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
						</button>
						<button
							type="button"
							onClick={() => void endCall()}
							aria-label={t("video_call.hang_up")}
							className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-90"
						>
							<PhoneOff className="h-7 w-7" />
						</button>
						<button
							type="button"
							onClick={handleToggleCamera}
							aria-label={t(cameraOff ? "video_call.camera_on" : "video_call.camera_off")}
							className={controlButtonClass}
						>
							{cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
						</button>
					</div>
				</>
			) : (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
					<div className="relative h-28 w-28">
						{phase === "incoming-ringing" || phase === "outgoing-ringing" ? (
							<span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)]/25" />
						) : null}
						<div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-[var(--accent)]/40 bg-neutral-700">
							<ProfileImage src={avatarUrl} alt="" />
						</div>
					</div>
					<div className="text-xl font-bold">{callInfo.displayName}</div>
					<div className="text-sm text-white/70">
						{phase === "incoming-ringing"
							? t("video_call.incoming_title")
							: t("video_call.outgoing_ringing")}
					</div>
					<div
						className="mt-8 flex items-center gap-8"
						style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
					>
						{phase === "incoming-ringing" ? (
							<button
								type="button"
								onClick={() => void handleAccept()}
								className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition active:scale-90"
								aria-label={t("video_call.accept")}
							>
								<Video className="h-7 w-7" />
							</button>
						) : null}
						<button
							type="button"
							onClick={() => void endCall()}
							className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-90"
							aria-label={t(phase === "incoming-ringing" ? "video_call.decline" : "video_call.hang_up")}
						>
							<PhoneOff className="h-7 w-7" />
						</button>
					</div>
				</div>
			)}
		</div>,
		document.body,
	);
}
