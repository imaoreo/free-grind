import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

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
		return detail.conversationId;
	}

	if (typeof detail.action === "string" && detail.action.startsWith("chat:")) {
		const conversationId = detail.action.slice(5).trim();
		return conversationId || null;
	}

	return null;
}

function getNotificationRoute(detail: NativePushNotificationDetail): string | null {
	const conversationId = getConversationId(detail);
	if (conversationId) {
		return `/chat/${conversationId}`;
	}

	if (detail.action === "taps") {
		return "/interest?tab=taps";
	}

	return null;
}

export function PushNotificationBridge() {
	const navigate = useNavigate();

	useEffect(() => {
		const handleDetail = (detail: NativePushNotificationDetail) => {
			console.info("[PUSH_EVENT] Received native push payload", detail);

			if (detail.event === "opened") {
				const route = getNotificationRoute(detail);
				if (route) {
					navigate(route);
				}
			}
		};

		const onPushNotification = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			if (!isPushNotificationDetail(detail)) {
				console.warn("[PUSH_EVENT] Ignoring malformed native push payload", detail);
				return;
			}

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