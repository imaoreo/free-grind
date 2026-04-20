import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("app")!).render(
	<React.StrictMode>
		<BrowserRouter>
			<App />
			<Toaster position="top-center" />
		</BrowserRouter>
	</React.StrictMode>,
);
