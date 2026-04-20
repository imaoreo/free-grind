import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function SettingsPage() {
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
					<h1 className="app-title mb-2">Settings</h1>
					<p className="app-subtitle">Manage your profile and app preferences.</p>
				</header>

				<div className="surface-card p-5 sm:p-6">
					<div className="grid gap-4">
						<div>
							<p className="text-sm font-medium text-[var(--text-muted)]">User ID</p>
							<p className="mt-1 text-lg font-semibold">{userId ?? "Not available"}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-[var(--text-muted)]">Account Status</p>
							<p className="mt-1 text-lg font-semibold">
								{userId ? "Signed in" : "Not signed in"}
							</p>
						</div>
						<div>
							<p className="text-sm font-medium text-[var(--text-muted)]">More Settings</p>
							<p className="mt-1 text-[var(--text-muted)]">
								Profile preferences and advanced controls are coming soon.
							</p>
						</div>
					</div>

					<div className="mt-6 flex flex-wrap items-center gap-3">
						<Link
							to="/"
							className="rounded-xl border border-[var(--border)] px-4 py-2.5 font-medium"
						>
							Back to Browse
						</Link>
						<button
							onClick={handleLogout}
							className="btn-accent px-4 py-2.5"
						>
							Logout
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
