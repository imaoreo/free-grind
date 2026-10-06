import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Tauri v2's unlisten() is async and reads listeners[eventId].handlerId with
// no null check. A close/reload race becomes an unhandled rejection overlay
// on iOS WebKit. Wrap the lookup so a missing listener is a no-op.
function safeTauriUnlisten() {
	const needle =
		"window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);";
	const replacement =
		"try { window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId); } catch {}";
	return {
		name: "safe-tauri-unlisten",
		transform(code, id) {
			if (!id.includes("@tauri-apps/api") || !code.includes(needle)) {
				return null;
			}
			return {
				code: code.replaceAll(needle, replacement),
				map: null,
			};
		},
	};
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const packageJsonPath = fileURLToPath(new URL("./package.json", import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const appVersion = packageJson.version ?? "0.0.0";

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [safeTauriUnlisten(), react(), tailwindcss()],
	define: {
		"import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "chrome69",
		cssTarget: "chrome69",
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (
						id.includes("/node_modules/react/") ||
						id.includes("/node_modules/react-dom/") ||
						id.includes("/node_modules/scheduler/")
					) {
						return "vendor-react";
					}
					if (
						id.includes("/node_modules/react-router") ||
						id.includes("/node_modules/@remix-run/")
					) {
						return "vendor-router";
					}
					if (
						id.includes("/node_modules/leaflet/") ||
						id.includes("/node_modules/react-leaflet/")
					) {
						return "vendor-map";
					}
					if (id.includes("/node_modules/@tauri-apps/")) {
						return "vendor-tauri";
					}
					if (
						id.includes("/node_modules/zod/") ||
						id.includes("/node_modules/@msgpack/")
					) {
						return "vendor-data";
					}
				},
			},
		},
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1420,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
}));
