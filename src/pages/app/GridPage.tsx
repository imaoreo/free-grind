import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export function GridPage() {
	const { userId, logout } = useAuth();
	const navigate = useNavigate();

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Logout failed:", error);
		}
	};

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<header className="mb-6">
					<h1 className="app-title mb-2">Browse Profiles</h1>
					<p className="app-subtitle">
						Profile Grid - This is where the main app content will go
					</p>
				</header>
				<div className="surface-card p-5 sm:p-6">
					<p className="text-[var(--text-muted)]">
						Logged in as: <span className="font-semibold">{userId}</span>
					</p>
					<button
						onClick={handleLogout}
						className="btn-accent mt-5 px-4 py-2.5"
					>
						Logout
					</button>
				</div>
			</div>
		</section>
	);
}
