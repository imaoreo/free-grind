import { useState } from "react";
import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";

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
		<AuthShell
			title="Sign Up"
			subtitle="Sign up is not implemented yet. Track progress in Issue #2."
			footer={
				<Link
					to="/auth/sign-in"
					className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
				>
					Already have an account? Sign in
				</Link>
			}
		>
			<form onSubmit={handleSubmit} className="space-y-4">
				<Button
					type="submit"
					variant="primary"
					loading={isLoading}
					className="w-full"
				>
					{isLoading ? "Opening issue..." : "Open Issue #2"}
				</Button>
			</form>
		</AuthShell>
	);
}
