import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "chrome71",
		cssTarget: "chrome71",
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
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
}));
