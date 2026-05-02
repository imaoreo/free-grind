import { useState } from "react";
import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";
import { useTranslation } from "react-i18next";

export function SignUpPage() {
	const { t } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		try {
			await openUrl("https://github.com/kezza2k7/free-grind/issues/2");
		} catch (error) {
			// Web fallback when not running under Tauri
			window.open(
				"https://github.com/kezza2k7/free-grind/issues/2",
				"_blank",
				"noopener,noreferrer",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<AuthShell
			title={t("auth.sign_up.title")}
			subtitle={t("auth.sign_up.subtitle")}
			footer={
				<Link
					to="/auth/sign-in"
					className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
				>
					{t("auth.sign_up.have_account")}
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
					{isLoading
						? t("auth.sign_up.opening_issue")
						: t("auth.sign_up.open_issue")}
				</Button>
			</form>
		</AuthShell>
	);
}
