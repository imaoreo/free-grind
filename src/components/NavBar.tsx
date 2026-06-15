import { Grid as GridIcon, Droplet, Flame, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useState, useEffect, useRef } from "react";
import { cn } from "../utils/cn";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/useAuth";
import {
	getInterestLastSeen,
	INTEREST_SEEN_EVENT,
	markInterestSeen,
	getInboxLastSeen,
	INBOX_SEEN_EVENT,
	markInboxSeen,
} from "../services/seenStore";
import { CHAT_REALTIME_EVENT, TAP_RECEIVED_EVENT } from "./ChatRealtimeBridge";
import { messageSchema, type Message } from "../types/messages";
import type { RealtimeEnvelope } from "../types/chat-realtime";
import { useInterestData } from "../hooks/queries/useInterestQueries";

/**
 * Extracts and validates chat messages from a variety of possible realtime envelope formats.
 * WebSocket events from the API can wrap messages in several ways (e.g., direct payload,
 * nested in a 'message' field, or as an array of 'messages').
 */
function extractMessages(envelope: RealtimeEnvelope): Message[] {
	const candidates: Message[] = [];

	// 1. Try to parse the payload directly as a single message
	const direct = messageSchema.safeParse(envelope.payload);
	if (direct.success) candidates.push(direct.data);

	// 2. Deep-probe common nesting patterns in the envelope structure
	for (const payload of [envelope.payload, envelope.data, envelope]) {
		if (!payload || typeof payload !== "object") continue;
		const record = payload as Record<string, unknown>;

		// Check for single nested message: { message: { ... } }
		if (record.message) {
			const parsed = messageSchema.safeParse(record.message);
			if (parsed.success) candidates.push(parsed.data);
		}

		// Check for multiple messages: { messages: [ { ... }, { ... } ] }
		if (Array.isArray(record.messages)) {
			for (const candidate of record.messages) {
				const parsed = messageSchema.safeParse(candidate);
				if (parsed.success) candidates.push(parsed.data);
			}
		}
	}

	// 3. Deduplicate messages by their unique ID to avoid double-processing
	const seen = new Set<string>();
	return candidates.filter((m) => {
		if (seen.has(m.messageId)) return false;
		seen.add(m.messageId);
		return true;
	});
}

export function NavBar() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const apiFunctions = useApiFunctions();
	const { userId } = useAuth();
	const { data: interestData } = useInterestData();

	const pathRef = useRef(location.pathname);
	useEffect(() => {
		pathRef.current = location.pathname;
	}, [location.pathname]);

	const [activeTab, setActiveTab] = useState("browse");
	const [unreadCount, setUnreadCount] = useState(0);
	const [interestUnseen, setInterestUnseen] = useState(false);
	const [inboxUnseen, setInboxUnseen] = useState(false);

	// Read preferences directly from localStorage (defaulting to true if not set)
	const [showRightNow] = useState(() => window.localStorage.getItem("fg-show-right-now") !== "false");
	const [showInterest] = useState(() => window.localStorage.getItem("fg-show-interest") !== "false");

	const navItems = [
		{
			value: "browse",
			label: t("nav.browse"),
			icon: GridIcon,
			path: "/",
			visible: true, // Mandatory
		},
		{
			value: "right-now",
			label: t("nav.right_now"),
			icon: Droplet,
			path: "/right-now",
			visible: showRightNow, // Toggleable
		},
		{
			value: "interest",
			label: t("nav.interest"),
			icon: Flame,
			path: "/interest",
			visible: showInterest, // Toggleable
		},
		{
			value: "inbox",
			label: t("nav.inbox"),
			icon: MessageCircle,
			path: "/chat",
			visible: true, // Mandatory
		},
	].filter(item => item.visible);

	// Update active tab based on current path
	useEffect(() => {
		const currentItem = navItems.find(
			(item) =>
				(item.path === "/" &&
					(location.pathname === "/" ||
						location.pathname.startsWith("/browse/"))) ||
				location.pathname === item.path ||
				(item.path !== "/" && location.pathname.startsWith(`${item.path}/`)),
		);
		if (currentItem) {
			setActiveTab(currentItem.value);
		}
	}, [location.pathname, navItems]);

	useEffect(() => {
		let cancelled = false;

		const refreshInboxState = async () => {
			if (document.hidden) return;
			const isAtInbox = pathRef.current.startsWith("/chat") || pathRef.current === "/settings/shared-albums";
			try {
				// Fetch the latest inbox summary to sync unread counts and global "seen" state
				const response = await apiFunctions.listConversations({
					page: 1,
				});

				if (cancelled) return;

				const totalUnread = response.entries.reduce(
					(sum, entry) => sum + (entry.data.unreadCount || 0),
					0,
				);
				setUnreadCount(totalUnread);

				const lastSeen = getInboxLastSeen();
				const newest = response.entries.reduce(
					(max, entry) => Math.max(max, entry.data.lastActivityTimestamp ?? 0),
					0,
				);

				if (lastSeen === 0) {
					// Initialize "last seen" on first run to avoid showing stale dots
					if (newest > 0) {
						window.localStorage.setItem("fg-inbox-last-seen", String(newest));
					}
					setInboxUnseen(false);
				} else {
					// If we are currently on the inbox page, ensure our "last seen"
					// timestamp is at least as high as the newest message we just fetched.
					// This prevents the dot from reappearing immediately when switching away.
					if (isAtInbox && newest > lastSeen) {
						markInboxSeen(newest);
					}
					setInboxUnseen(!isAtInbox && newest > lastSeen);
				}
			} catch {
				if (!cancelled) {
					setUnreadCount(0);
					setInboxUnseen(false);
				}
			}
		};

		void refreshInboxState();
		// Background safety poll to catch updates from other devices/stale socket
		const intervalId = window.setInterval(refreshInboxState, 60_000);

		const handleRealtime = (event: Event) => {
			const isAtInbox = pathRef.current.startsWith("/chat") || pathRef.current === "/settings/shared-albums";
			// If we are already looking at the inbox, suppress the dot immediately
			if (isAtInbox) {
				setInboxUnseen(false);
				return;
			}

			// Extract messages directly from the realtime event to avoid an expensive API reload.
			// This ensures the notification dot appears instantly with the incoming message.
			const envelope = (event as CustomEvent<RealtimeEnvelope>).detail;
			const messages = extractMessages(envelope);
			if (messages.length > 0) {
				const lastSeen = getInboxLastSeen();
				// Check for messages from other users
				const fromOthers = messages.filter(
					(m) => userId != null && Number(m.senderId) !== Number(userId)
				);

				if (fromOthers.length > 0) {
					const newest = Math.max(...fromOthers.map((m) => m.timestamp));
					// Show dot if the message is actually newer than our last visit
					if (newest > lastSeen) {
						setInboxUnseen(true);
					}
					// Optimistically increment the total unread count shown in the UI
					setUnreadCount((prev) => prev + fromOthers.length);
				}
			}
		};
		const onSeen = () => setInboxUnseen(false);

		const onVisibilityChange = () => {
			if (!document.hidden) {
				void refreshInboxState();
			}
		};

		window.addEventListener(CHAT_REALTIME_EVENT, handleRealtime);
		window.addEventListener(INBOX_SEEN_EVENT, onSeen as EventListener);
		window.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
			window.removeEventListener(CHAT_REALTIME_EVENT, handleRealtime as EventListener);
			window.removeEventListener(INBOX_SEEN_EVENT, onSeen as EventListener);
			window.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [apiFunctions, userId]);

	// Clear the inbox dot immediately when navigating to the chat section or shared albums
	useEffect(() => {
		if (location.pathname.startsWith("/chat") || location.pathname === "/settings/shared-albums") {
			setInboxUnseen(false);
		}
	}, [location.pathname]);

	// Track whether the Interest tab has anything new since the user last
	// looked. Listens for live update events via the useInterestData hook.
	useEffect(() => {
		const refreshInterestUnseen = () => {
			if (!interestData) return;
			const isAtInterest = pathRef.current === "/interest";
			const lastSeen = getInterestLastSeen();

			const newest = Math.max(
				...(interestData.taps.map(t => t.timestamp || 0)),
				...(interestData.views.map(v => v.timestamp || 0)),
				0
			);

			// On first run (no stored seen timestamp), treat current state as
			// already seen so we don't show a stale dot.
			if (lastSeen === 0) {
				if (newest > 0) {
					markInterestSeen(newest);
				}
				setInterestUnseen(false);
				return;
			}

			// If we are currently on the interest page, ensure our "last seen"
			// timestamp is at least as high as the newest item.
			if (isAtInterest && newest > lastSeen) {
				markInterestSeen(newest);
			}

			setInterestUnseen(!isAtInterest && newest > lastSeen);
		};

		refreshInterestUnseen();

		const onSeen = () => setInterestUnseen(false);
		window.addEventListener(INTEREST_SEEN_EVENT, onSeen as EventListener);

		return () => {
			window.removeEventListener(INTEREST_SEEN_EVENT, onSeen as EventListener);
		};
	}, [interestData]);

	// Clear the interest dot immediately when navigating to the interest section
	useEffect(() => {
		if (location.pathname === "/interest") {
			setInterestUnseen(false);
		}
	}, [location.pathname]);

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		const item = navItems.find((i) => i.value === value);
		if (item) {
			navigate(item.path);
		}
	};

	// Determine the grid column class safely based on exactly how many tabs remain
	const gridColsClass = 
		navItems.length === 2 ? "grid-cols-2" : 
		navItems.length === 3 ? "grid-cols-3" : 
		"grid-cols-4";

	return (
		<nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] md:px-4 md:pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
			<div
				className="mx-auto w-full max-w-4xl rounded-2xl border border-[var(--border)] p-1.5"
				style={{
					backgroundColor: "rgba(22, 29, 39, 0.9)",
					background: "color-mix(in srgb, var(--surface) 90%, transparent)",
					backdropFilter: "blur(16px)",
				}}
			>
				<Tabs value={activeTab} onValueChange={handleTabChange}>
					<TabsList className={`grid h-16 w-full ${gridColsClass} bg-transparent p-0 md:h-[4.1rem]`}>
						{navItems.map((item) => {
							const Icon = item.icon;
							return (
								<TabsTrigger
									key={item.value}
									value={item.value}
									onClick={() => {
										if (item.value === "browse" && activeTab === "browse") {
											window.dispatchEvent(new CustomEvent("browse-scroll-top"));
										}
									}}
									className={cn(
										"flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] md:gap-1.5",
										item.value === "right-now"
											? "focus-visible:ring-[var(--right-now)] data-[state=active]:bg-[var(--right-now)] data-[state=active]:text-white"
											: "focus-visible:ring-[var(--accent)] data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--accent-contrast)]"
									)}
								>
									<div className="relative">
										<Icon className="h-5 w-5 md:h-[1.2rem] md:w-[1.2rem]" />
										{(item.value === "inbox" && inboxUnseen) ||
										(item.value === "interest" && interestUnseen) ? (
											<span className="absolute -right-1 -top-1 flex h-2 w-2">
												<span
													className={cn(
														"absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
														activeTab === "right-now"
															? "bg-[var(--right-now)]"
															: "bg-[var(--accent)]",
													)}
												></span>
												<span
													className={cn(
														"relative inline-block h-2 w-2 rounded-full ring-1 ring-[var(--surface)]",
														activeTab === "right-now"
															? "bg-[var(--right-now)]"
															: "bg-[var(--accent)]",
													)}
												></span>
											</span>
										) : null}
									</div>
									<span className="text-xs md:text-[0.8rem]">
										{item.label}
									</span>
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>
			</div>
		</nav>
	);
}