import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/ibm-plex-sans/index.css";
import App from "./App";
import "./i18n";
import { markHotswapStartupReady, autoCheckAndInstallUpdate } from "./services/hotswap";
import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import "./index.css";

// Run sequentially: configure + notifyReady first, then check for updates
void markHotswapStartupReady().then(() => autoCheckAndInstallUpdate());

ReactDOM.createRoot(document.getElementById("app")!).render(
	<React.StrictMode>
		<BrowserRouter>
			<App />
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
						icon: (
							<Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
						),
					},
					blank: {
						icon: <Info className="w-5 h-5 text-blue-500" />,
					},
				}}
			/>
		</BrowserRouter>
	</React.StrictMode>,
);
