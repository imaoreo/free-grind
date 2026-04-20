import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				background: "var(--background, oklch(0.145 0 0))",
				foreground: "var(--foreground, oklch(0.95 0 0))",
				primary: "var(--primary, oklch(0.5 0.2 280))",
				secondary: "var(--secondary, oklch(0.5 0.15 200))",
				muted: "var(--muted, oklch(0.25 0 0))",
				"muted-foreground": "var(--muted-foreground, oklch(0.7 0 0))",
			},
		},
	},
	plugins: [],
} satisfies Config;
