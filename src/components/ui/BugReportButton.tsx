import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function BugReportButton() {
	const { t } = useTranslation();

	return (
		<Link
			to="/report-issue?kind=bug"
			className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline transition-colors"
		>
			{t("auth.bug_report.button")}
		</Link>
	);
}
