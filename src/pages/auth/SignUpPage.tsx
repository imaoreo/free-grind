import { useState } from "react";
import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";

export function SignUpPage() {
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		try {
			await openUrl("https://github.com/kezza2k7/open-grind/issues/2");
		} catch (error) {
			// Web fallback when not running under Tauri
			window.open(
				"https://github.com/kezza2k7/open-grind/issues/2",
				"_blank",
				"noopener,noreferrer",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<section className="app-screen flex items-center justify-center">
			<div className="surface-card w-full max-w-md p-6 sm:p-8">
				<h1 className="app-title mb-2">Sign Up</h1>
				<p className="app-subtitle mb-6">
					Sign up is not implemented yet. Track progress in Issue #2.
				</p>
				<form onSubmit={handleSubmit} className="space-y-4">
					<button
						type="submit"
						disabled={isLoading}
						className="btn-accent w-full px-4 py-3"
					>
						{isLoading ? "Opening issue..." : "Open Issue #2"}
					</button>
				</form>
				<div className="mt-4 text-center">
					<Link
						to="/auth/sign-in"
						className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
					>
						Already have an account? Sign in
					</Link>
				</div>
			</div>
		</section>
	);
}
