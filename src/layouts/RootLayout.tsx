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
			{/* Ultra-fine dithering to prevent banding effects */}
			<div
				className="fixed inset-0 opacity-[0.01] mix-blend-overlay pointer-events-none z-[-1]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
				}}
			/>
			<Outlet />
		</div>
	);
}
