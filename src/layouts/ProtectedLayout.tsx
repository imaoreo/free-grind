import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";

export function ProtectedLayout() {
	const location = useLocation();
    const isChatConversationRoute =
        (/^\/chat\/[^/]+$/.test(location.pathname) && location.pathname !== "/chat/albums") ||
        (location.pathname === "/chat" && new URLSearchParams(location.search).has("targetProfileId"));
	const isProfileRoute = /^\/profile\/[^/]+$/.test(location.pathname);

	// Must use the same "desktop" signal ChatPage.tsx uses for its dual-pane
	// layout (pointer/hover capability, not window width) — otherwise the two
	// can disagree (e.g. a mouse-driven window narrower than some arbitrary
	// width threshold) and this hides the navbar for a route ChatPage itself
	// never even considers "mobile fullscreen".
	const isChatDualPane = useDesktopBreakpoint();

	// Hide navbar on mobile/tablet for full-screen chat or profile pages.
	const shouldHideNavbar = (isChatConversationRoute || isProfileRoute) && !isChatDualPane;

	return (
		<div className="relative">
			<Outlet />
			{!shouldHideNavbar ? <NavBar /> : null}
		</div>
	);
}
