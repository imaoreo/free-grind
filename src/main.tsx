import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/ibm-plex-sans/index.css";
import App from "./App";
import "./i18n";
import { markHotswapStartupReady, autoCheckAndInstallUpdate } from "./services/hotswap";
import { initChatContactIndex } from "./services/chatContactIndex";
import { isTauri } from "@tauri-apps/api/core";
import { appLog } from "./utils/logger";
import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { DEFAULT_GC_TIME_MS } from "./config/ui-constants";
import { CrashBoundary } from "./components/CrashBoundary";
import { installGlobalCrashHandlers } from "./utils/crashOverlay";
import "./index.css";

installGlobalCrashHandlers();

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0, // Data is immediately considered stale (refetch on mount)
			gcTime: DEFAULT_GC_TIME_MS,
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

// Only enable Hotswap OTA updates in production. In development, this conflicts with Vite HMR
// and can lead to unexpected reloads or WebSocket connection issues with the dev server.
if (import.meta.env.PROD) {
	void markHotswapStartupReady().then(() => autoCheckAndInstallUpdate());
}
if (isTauri()) {
	void initChatContactIndex().catch((err) => {
		appLog.warn("[chat-index] failed to initialize:", err);
	});
}

ReactDOM.createRoot(document.getElementById("app")!).render(
	<React.StrictMode>
		<CrashBoundary>
		<QueryClientProvider client={queryClient}>
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
		</QueryClientProvider>
		</CrashBoundary>
	</React.StrictMode>,
);
