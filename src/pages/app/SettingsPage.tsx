import { useNavigate } from "react-router-dom";
import { BadgeInfo, ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function SettingsPage() {
	const { logout } = useAuth();
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
			<header className="mb-6">
				<h1 className="app-title mb-2">Settings</h1>
				<p className="app-subtitle">Choose what you want to manage.</p>
			</header>

			<div className="grid gap-4">
				<button
					type="button"
					onClick={() => navigate("/settings/profile-editor")}
					className="surface-card flex w-full items-center justify-between p-4 text-left sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<BadgeInfo className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">Profile Editor</p>
							<p className="text-sm text-[var(--text-muted)]">
								Edit profile details, identity, and preferences.
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

				<div className="mt-2 flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => navigate("/")}
						className="rounded-xl border border-[var(--border)] px-4 py-2.5 font-medium"
					>
						Back to Browse
					</button>
					<button
						type="button"
						onClick={handleLogout}
						className="btn-accent inline-flex items-center gap-2 px-4 py-2.5"
					>
						<LogOut className="h-4 w-4" />
						Logout
					</button>
				</div>
			</div>
		</section>
	);
}
