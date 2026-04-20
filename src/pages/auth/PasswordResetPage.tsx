import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";

async function openIssueLink(url: string) {
	try {
		await openUrl(url);
	} catch {
		// Web fallback when not running under Tauri
		window.open(url, "_blank", "noopener,noreferrer");
	}
}

export function PasswordResetPage() {
	return (
		<section className="app-screen flex items-center justify-center">
			<div className="surface-card w-full max-w-md p-6 sm:p-8">
				<h1 className="app-title mb-2">Reset Password</h1>
				<p className="app-subtitle mb-6">
					This flow is not implemented yet. Track progress in Issue #1.
				</p>
				<button
					type="button"
					onClick={() => {
						void openIssueLink(
							"https://github.com/kezza2k7/open-grind/issues/1",
						);
					}}
					className="btn-accent block w-full px-4 py-3 text-center"
				>
					Open Issue #1
				</button>
				<div className="mt-4 text-center">
					<Link
						to="/auth/sign-in"
						className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
					>
						Back to sign in
					</Link>
				</div>
			</div>
		</section>
	);
}
