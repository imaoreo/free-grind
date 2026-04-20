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
		<nav className="fixed bottom-2 left-1/2 -translate-x-1/2">
			<Tabs value={activeTab} onValueChange={handleTabChange}>
				<TabsList className="flex gap-4">
					{navItems.map((item) => {
						const Icon = item.icon;
						return (
							<TabsTrigger
								key={item.value}
								value={item.value}
								className="flex flex-col gap-1 items-center"
							>
								<Icon className="w-5 h-5" />
								<span className="text-xs">{item.label}</span>
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>
		</nav>
	);
}
