import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bug } from "lucide-react";

export function BugReportButton() {
	const { t } = useTranslation();

	return (
		<Link
			to="/report-issue?kind=bug"
			className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
		>
			<Bug className="h-3.5 w-3.5" />
			{t("auth.bug_report.button")}
		</Link>
	);
}
