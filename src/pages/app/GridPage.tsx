import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CircleUserRound } from "lucide-react";

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
					<div className="mb-2 flex items-start justify-between gap-4">
						<div>
							<h1 className="app-title">Browse Profiles</h1>
						</div>
						<button
							type="button"
							onClick={() => navigate("/settings")}
							className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-all hover:scale-[1.03]"
							aria-label="Open settings"
							title="Settings"
						>
							<CircleUserRound className="h-6 w-6" />
						</button>
					</div>
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
