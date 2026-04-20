import { Outlet } from "react-router-dom";
import { NavBar } from "../components/NavBar";

export function ProtectedLayout() {
	return (
		<div className="relative">
			<Outlet />
			<NavBar />
		</div>
	);
}
