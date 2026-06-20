import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { useEffect, useState } from "react";

export function ProtectedLayout() {
	const location = useLocation();
    const isChatConversationRoute =
        (/^\/chat\/[^/]+$/.test(location.pathname) && location.pathname !== "/chat/albums") ||
        /^\/chat\/blocked-me\/[^/]+$/.test(location.pathname) ||
        (location.pathname === "/chat" && new URLSearchParams(location.search).has("targetProfileId"));
	const isProfileRoute = /^\/profile\/[^/]+$/.test(location.pathname);

	// Determine if we are on a large enough screen to show both the inbox and chat thread.
	// This matches the 1024px breakpoint used in ChatPage.tsx for the dual-pane layout.
	const [isChatDualPane, setIsChatDualPane] = useState(window.innerWidth >= 1024);

	useEffect(() => {
		const handleResize = () => {
			setIsChatDualPane(window.innerWidth >= 1024);
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// Hide navbar on mobile/tablet for full-screen chat or profile pages.
	const shouldHideNavbar = (isChatConversationRoute || isProfileRoute) && !isChatDualPane;

	return (
		<div className="relative">
			<Outlet />
			{!shouldHideNavbar ? <NavBar /> : null}
		</div>
	);
}
