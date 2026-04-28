import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { useEffect, useState } from "react";

export function ProtectedLayout() {
	const location = useLocation();
	const isChatConversationRoute = /^\/chat\/[^/]+$/.test(location.pathname);
	const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

	useEffect(() => {
		const handleResize = () => {
			setIsDesktop(window.innerWidth >= 768);
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// Hide navbar on mobile conversation thread pages only.
	const shouldHideNavbar = isChatConversationRoute && !isDesktop;

	return (
		<div className="relative">
			<Outlet />
			{!shouldHideNavbar ? <NavBar /> : null}
		</div>
	);
}
