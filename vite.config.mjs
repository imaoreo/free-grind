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
		rollupOptions: {
			output: {
				manualChunks: {
					"vendor-react": ["react", "react-dom", "react-router-dom"],
					"vendor-ui": [
						"@radix-ui/react-tabs",
						"lucide-react",
						"clsx",
						"tailwind-merge",
						"react-hot-toast",
					],
					"vendor-map": ["leaflet", "react-leaflet"],
					"vendor-tauri": [
						"@tauri-apps/api",
						"@tauri-apps/plugin-fs",
						"@tauri-apps/plugin-geolocation",
						"@tauri-apps/plugin-opener",
						"@tauri-apps/plugin-os",
					],
					"vendor-data": ["zod", "@msgpack/msgpack"],
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
