import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { markHotswapStartupReady, autoCheckAndInstallUpdate } from "./services/hotswap";
import "./index.css";

// Run sequentially: configure + notifyReady first, then check for updates
void markHotswapStartupReady().then(() => autoCheckAndInstallUpdate());

ReactDOM.createRoot(document.getElementById("app")!).render(
	<React.StrictMode>
		<BrowserRouter>
			<App />
			<Toaster position="top-center" />
		</BrowserRouter>
	</React.StrictMode>,
);
