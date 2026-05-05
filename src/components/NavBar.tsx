import { Grid as GridIcon, Droplet, Flame, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useState, useEffect } from "react";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useTranslation } from "react-i18next";
import {
	getInterestLastSeen,
	INTEREST_SEEN_EVENT,
} from "../services/seenStore";
import { TAP_RECEIVED_EVENT } from "./ChatRealtimeBridge";

export function NavBar() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const apiFunctions = useApiFunctions();
	const [activeTab, setActiveTab] = useState("browse");
	const [unreadCount, setUnreadCount] = useState(0);
	const [interestUnseen, setInterestUnseen] = useState(false);
	const navItems = [
		{
			value: "browse",
			label: t("nav.browse"),
			icon: GridIcon,
			path: "/",
		},
		{
			value: "right-now",
			label: t("nav.right_now"),
			icon: Droplet,
			path: "/right-now",
		},
		{
			value: "interest",
			label: t("nav.interest"),
			icon: Flame,
			path: "/interest",
		},
		{
			value: "inbox",
			label: t("nav.inbox"),
			icon: MessageCircle,
			path: "/chat",
		},
	];

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
	}, [location.pathname]);

	useEffect(() => {
		let cancelled = false;

		const loadUnreadCount = async () => {
			try {
				const response = await apiFunctions.listConversations({
					page: 1,
					filters: { unreadOnly: true },
				});
				const total = response.entries.reduce(
					(sum, entry) => sum + entry.data.unreadCount,
					0,
				);
				if (!cancelled) {
					setUnreadCount(total);
				}
			} catch {
				if (!cancelled) {
					setUnreadCount(0);
				}
			}
		};

		void loadUnreadCount();
		const intervalId = window.setInterval(() => {
			void loadUnreadCount();
		}, 45000);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
		};
	}, [apiFunctions]);

	// Track whether the Interest tab has anything new since the user last
	// looked. Polls taps + views and listens for live tap events.
	useEffect(() => {
		let cancelled = false;

		const refreshInterestUnseen = async () => {
			try {
				const [tapsResponse, viewsResponse] = await Promise.all([
					apiFunctions.getTaps(),
					apiFunctions.getViews(),
				]);
				const lastSeen = getInterestLastSeen();
				const newest = (() => {
					const tapsRaw = (tapsResponse as { profiles?: unknown[] }).profiles;
					const viewsRaw = (viewsResponse as { profiles?: unknown[] }).profiles;
					let max = 0;
					for (const list of [tapsRaw, viewsRaw]) {
						if (!Array.isArray(list)) continue;
						for (const entry of list) {
							if (!entry || typeof entry !== "object") continue;
							const ts = (entry as { timestamp?: unknown }).timestamp;
							const value =
								typeof ts === "number"
									? ts
									: typeof ts === "string"
										? Number(ts)
										: 0;
							if (Number.isFinite(value) && value > max) max = value;
						}
					}
					return max;
				})();

				if (cancelled) return;

				// On first run (no stored seen timestamp), treat current state as
				// already seen so we don't show a stale dot.
				if (lastSeen === 0) {
					if (newest > 0) {
						window.localStorage.setItem(
							"fg-interest-last-seen",
							String(newest),
						);
					}
					setInterestUnseen(false);
					return;
				}

				setInterestUnseen(newest > lastSeen);
			} catch {
				if (!cancelled) setInterestUnseen(false);
			}
		};

		void refreshInterestUnseen();
		const intervalId = window.setInterval(() => {
			void refreshInterestUnseen();
		}, 60_000);

		const onTap = () => setInterestUnseen(true);
		const onSeen = () => setInterestUnseen(false);
		window.addEventListener(TAP_RECEIVED_EVENT, onTap as EventListener);
		window.addEventListener(INTEREST_SEEN_EVENT, onSeen as EventListener);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
			window.removeEventListener(TAP_RECEIVED_EVENT, onTap as EventListener);
			window.removeEventListener(
				INTEREST_SEEN_EVENT,
				onSeen as EventListener,
			);
		};
	}, [apiFunctions]);

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		const item = navItems.find((i) => i.value === value);
		if (item) {
			navigate(item.path);
		}
	};

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
					<TabsList className="grid h-16 w-full grid-cols-4 bg-transparent p-0 md:h-[4.1rem]">
						{navItems.map((item) => {
							const Icon = item.icon;
							return (
								<TabsTrigger
									key={item.value}
									value={item.value}
									className="flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--accent-contrast)] md:gap-1.5"
								>
									<Icon className="h-5 w-5 md:h-[1.2rem] md:w-[1.2rem]" />
									<div className="relative">
										<span className="text-xs md:text-[0.8rem]">
											{item.label}
										</span>
										{(item.value === "inbox" && unreadCount > 0) ||
										(item.value === "interest" && interestUnseen) ? (
											<span className="absolute right-1 -top-6 flex h-2 w-2">
                                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75"></span>
                                              <span className="relative inline-block h-2 w-2 rounded-full bg-[var(--accent)] ring-1 ring-[var(--surface)]"></span>
                                            </span>
										) : null}
									</div>
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>
			</div>
		</nav>
	);
}
