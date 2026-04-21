import { Grid as GridIcon, Droplet, Flame, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useState, useEffect, useMemo } from "react";
import { useApi } from "../hooks/useApi";
import { createChatService } from "../services/chatService";

const navItems = [
	{
		value: "browse",
		label: "Browse",
		icon: GridIcon,
		path: "/",
	},
	{
		value: "right-now",
		label: "Right Now",
		icon: Droplet,
		path: "/right-now",
	},
	{
		value: "interest",
		label: "Interest",
		icon: Flame,
		path: "/interest",
	},
	{
		value: "inbox",
		label: "Inbox",
		icon: MessageCircle,
		path: "/chat",
	},
];

export function NavBar() {
	const navigate = useNavigate();
	const location = useLocation();
	const { fetchRest } = useApi();
	const chatService = useMemo(() => createChatService(fetchRest), [fetchRest]);
	const [activeTab, setActiveTab] = useState("browse");
	const [unreadCount, setUnreadCount] = useState(0);

	// Update active tab based on current path
	useEffect(() => {
		const currentItem = navItems.find(
			(item) =>
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
				const response = await chatService.listConversations({
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
	}, [chatService]);

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
										<span className="text-xs md:text-[0.8rem]">{item.label}</span>
										{item.value === "inbox" && unreadCount > 0 ? (
											<span className="absolute -right-5 -top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-[var(--accent-contrast)] md:-right-6">
												{Math.min(99, unreadCount)}
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
