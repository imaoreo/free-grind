import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { appLog } from "../utils/logger";

type NativePushNotificationDetail = {
	event?: string;
	action?: string | null;
	conversationId?: string | null;
};

declare global {
	interface Window {
		__FG_PUSH_NOTIFICATIONS?: NativePushNotificationDetail[];
	}
}

function isPushNotificationDetail(value: unknown): value is NativePushNotificationDetail {
	return typeof value === "object" && value !== null;
}

function detailKey(detail: NativePushNotificationDetail): string {
	const event = typeof detail.event === "string" ? detail.event : "";
	const action = typeof detail.action === "string" ? detail.action : "";
	const conversationId =
		typeof detail.conversationId === "string" ? detail.conversationId : "";
	return `${event}|${action}|${conversationId}`;
}

function removeQueuedPushNotification(detail: NativePushNotificationDetail) {
	if (!Array.isArray(window.__FG_PUSH_NOTIFICATIONS)) {
		return;
	}

	const targetKey = detailKey(detail);
	window.__FG_PUSH_NOTIFICATIONS = window.__FG_PUSH_NOTIFICATIONS.filter(
		(queuedDetail) => detailKey(queuedDetail) !== targetKey,
	);
}

function consumePendingPushNotifications(
	handleDetail: (detail: NativePushNotificationDetail) => void,
) {
	const queue = Array.isArray(window.__FG_PUSH_NOTIFICATIONS)
		? [...window.__FG_PUSH_NOTIFICATIONS]
		: [];
	window.__FG_PUSH_NOTIFICATIONS = [];
	for (const detail of queue) {
		handleDetail(detail);
	}
}

function getConversationId(detail: NativePushNotificationDetail): string | null {
	if (typeof detail.conversationId === "string" && detail.conversationId.trim()) {
		return detail.conversationId.trim();
	}

	if (typeof detail.action === "string" && detail.action.startsWith("chat:")) {
		const conversationId = detail.action.slice(5).trim();
		return conversationId || null;
	}

	if (
		typeof detail.action === "string" &&
		detail.action.startsWith("grindr://conversation")
	) {
		try {
			const url = new URL(detail.action);
			const conversationId = url.searchParams.get("id")?.trim() ?? "";
			return conversationId || null;
		} catch {
			return null;
		}
	}

	return null;
}

function getNotificationRoute(detail: NativePushNotificationDetail): string | null {
	const conversationId = getConversationId(detail);
	if (conversationId) {
		return `/chat/${encodeURIComponent(conversationId)}`;
	}

	if (detail.action === "taps") {
		return "/interest";
	}

	return null;
}

export function PushNotificationBridge() {
	const navigate = useNavigate();
	const recentlyHandledKeysRef = useRef<Map<string, number>>(new Map());

	// this asks for notification permission on launch instead of waiting for the
	// first autoblock (cuz that doesnt work), so the iOS prompt shows up
	useEffect(() => {
		if (!isTauriRuntime()) return;

		(async () => {
			try {
				const granted = await isPermissionGranted();
				if (!granted) {
					await requestPermission();
				}
			} catch (error) {
				appLog.warn("[PUSH_EVENT] Failed to prime notification permission", error);
			}
		})();
	}, []);

	useEffect(() => {
		const markHandled = (detail: NativePushNotificationDetail): boolean => {
			const key = detailKey(detail);
			const now = Date.now();
			const recentWindowMs = 10_000;
			const lastHandledAt = recentlyHandledKeysRef.current.get(key);
			if (typeof lastHandledAt === "number" && now - lastHandledAt < recentWindowMs) {
				return false;
			}

			recentlyHandledKeysRef.current.set(key, now);
			for (const [existingKey, handledAt] of recentlyHandledKeysRef.current) {
				if (now - handledAt >= recentWindowMs) {
					recentlyHandledKeysRef.current.delete(existingKey);
				}
			}

			return true;
		};

		const handleDetail = (detail: NativePushNotificationDetail) => {
			if (!markHandled(detail)) {
				appLog.info("[PUSH_EVENT] Skipping duplicate push payload", detail);
				return;
			}

			appLog.info("[PUSH_EVENT] Received native push payload", detail);

			if (detail.event === "opened") {
				const route = getNotificationRoute(detail);
				if (route) {
					try {
						navigate(route);
					} catch (error) {
						appLog.error(
							"[PUSH_EVENT] Failed to navigate to notification route",
							error,
						);
						navigate("/chat");
					}
				}
			}
		};

		const onPushNotification = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			if (!isPushNotificationDetail(detail)) {
				appLog.warn("[PUSH_EVENT] Ignoring malformed native push payload", detail);
				return;
			}

			removeQueuedPushNotification(detail);
			handleDetail(detail);
		};

		window.addEventListener(
			"fg:push-notification",
			onPushNotification as EventListener,
		);
		consumePendingPushNotifications(handleDetail);

		return () => {
			window.removeEventListener(
				"fg:push-notification",
				onPushNotification as EventListener,
			);
		};
	}, [navigate]);

	return null;
}