import { Outlet, useLocation } from "react-router-dom";

export function RootLayout() {
	const location = useLocation();
	const isRightNow = location.pathname === "/right-now";

	return (
		<div
			className="app-shell"
			style={{ "--app-accent-gradient": isRightNow ? "var(--right-now)" : "var(--accent)" } as React.CSSProperties}
		>
			<div className="fixed inset-0 pointer-events-none z-[-1] backdrop-blur-[100px] opacity-40" />
			<Outlet />
		</div>
	);
}
