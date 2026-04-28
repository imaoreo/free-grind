import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { useEffect, useState } from "react";

export function ProtectedLayout() {
	const location = useLocation();
	const isChat = location.pathname.startsWith("/chat");
	const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

	useEffect(() => {
		const handleResize = () => {
			setIsDesktop(window.innerWidth >= 768);
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// Hide navbar on mobile chat pages only
	const shouldHideNavbar = isChat && !isDesktop;

	return (
		<div className="relative">
			<Outlet />
			{!shouldHideNavbar ? <NavBar /> : null}
		</div>
	);
}
