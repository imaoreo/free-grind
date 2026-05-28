import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function RootLayout() {
	const location = useLocation();
	const navigate = useNavigate();
	const isRightNow = location.pathname === "/right-now";

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (e.defaultPrevented) return;

				// Don't navigate back if the user is typing in an input
				const isInput =
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLTextAreaElement ||
					(e.target as HTMLElement)?.isContentEditable;

				if (isInput) return;

				// Navigate back
				navigate(-1);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [navigate]);

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
