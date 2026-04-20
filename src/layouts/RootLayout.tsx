import { Outlet } from "react-router-dom";

export function RootLayout() {
	return (
		<div className="app-shell">
			<Outlet />
		</div>
	);
}
