import { Grid as GridIcon, Droplet, Flame, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useState, useEffect } from "react";

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
	const [activeTab, setActiveTab] = useState("browse");

	// Update active tab based on current path
	useEffect(() => {
		const currentItem = navItems.find(
			(item) => item.path === location.pathname,
		);
		if (currentItem) {
			setActiveTab(currentItem.value);
		}
	}, [location.pathname]);

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		const item = navItems.find((i) => i.value === value);
		if (item) {
			navigate(item.path);
		}
	};

	return (
		<nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
			<div
				className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--border)] p-1"
				style={{
					background: "color-mix(in srgb, var(--surface) 88%, transparent)",
					backdropFilter: "blur(12px)",
				}}
			>
				<Tabs value={activeTab} onValueChange={handleTabChange}>
					<TabsList className="grid h-16 w-full grid-cols-4 bg-transparent p-0">
						{navItems.map((item) => {
							const Icon = item.icon;
							return (
								<TabsTrigger
									key={item.value}
									value={item.value}
									className="flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[var(--text-muted)] data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--accent-contrast)]"
								>
									<Icon className="h-5 w-5" />
									<span className="text-xs">{item.label}</span>
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>
			</div>
		</nav>
	);
}
