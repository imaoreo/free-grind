import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BackToSettings() {
	const navigate = useNavigate();
	return (
		<button
			type="button"
			onClick={() => navigate("/settings")}
			className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
		>
			<ChevronLeft className="h-4 w-4" />
			Settings
		</button>
	);
}
