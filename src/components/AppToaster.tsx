import { Toaster } from "react-hot-toast";
import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

// Shared styling for react-hot-toast, used both by the app-wide instance in
// main.tsx and by a second instance mounted inside native <dialog> modals
// (see AutomationRuleEditor.tsx) — a <dialog> shown via showModal() is
// promoted to the browser's top layer, which always paints above regular
// document content regardless of z-index, so the app-wide Toaster's toasts
// end up hidden behind the dialog's backdrop. Rendering a second Toaster as
// a descendant of the open dialog puts it in that same top-layer subtree,
// so it paints above the backdrop instead.
export function AppToaster() {
	return (
		<Toaster
			position="top-center"
			containerStyle={{
				// Offset the toast container to avoid overlapping with the device status bar or notch.
				// We use a larger offset to ensure visibility even if env() is not populated.
				top: "calc(env(safe-area-inset-top, 0px) + 54px)",
			}}
			toastOptions={{
				className:
					"surface-card !bg-[var(--surface)] !text-[var(--text)] !border-[var(--border)] !rounded-[var(--radius-md)] !px-4 !py-3 !shadow-2xl flex items-center gap-3",
				duration: 4000,
				style: {
					background: "var(--surface)",
					color: "var(--text)",
					border: "1px solid var(--border)",
				},
				success: {
					icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
				},
				error: {
					icon: <AlertCircle className="w-5 h-5 text-red-500" />,
				},
				loading: {
					icon: <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />,
				},
				blank: {
					icon: <Info className="w-5 h-5 text-blue-500" />,
				},
			}}
		/>
	);
}
