import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";

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
		<AuthShell
			title="Reset Password"
			subtitle="This flow is not implemented yet. Track progress in Issue #1."
			footer={
				<Link
					to="/auth/sign-in"
					className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
				>
					Back to sign in
				</Link>
			}
		>
			<Button
				type="button"
				variant="primary"
				onClick={() => {
					void openIssueLink("https://github.com/kezza2k7/free-grind/issues/1");
				}}
				className="w-full"
			>
				Open Issue #1
			</Button>
		</AuthShell>
	);
}
