import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { grindrApiReference } from "../lib";

const base = "/";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	srcDir: "content",
	base,

	vite: {
		resolve: {
			alias: {
				$lib: fileURLToPath(new URL("../lib", import.meta.url)),
			},
		},
	},

	cleanUrls: true,

	title: "Open Grind",
	description: "Open Grind project documentation and Grindr API reference",
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: "Home", link: "/" },
			{ text: "Guides", link: "/guide/" },
			{ text: "Grindr API", link: "/grindr-api" },
		],

		search: {
			provider: "local",
		},

		sidebar: {
			"/guide/": [
				{
					text: "User guide",
					items: [
						{ text: "Overview", link: "/guide/" },
						{ text: "Why Open Grind", link: "/guide/why-open-grind" },
						{ text: "Download", link: "/guide/download" },
						{ text: "Login", link: "/guide/login" },
						{ text: "Getting Started", link: "/guide/getting-started" },
						{ text: "Chats and Media", link: "/guide/chats-and-media" },
						{ text: "Privacy and Safety", link: "/guide/privacy-and-safety" },
						{ text: "Troubleshooting", link: "/guide/troubleshooting" },
					],
				},
			],
			"/grindr-api/": [
				{
					text: "Grindr API",
					link: "/grindr-api/",
					items: grindrApiReference,
				},
			],
		},

		socialLinks: [
			{ icon: "git", link: "https://github.com/kezza2k7/open-grind" },
		],

		footer: {
			message: "Open Grind is not affiliated with Grindr in any way.",
			copyright:
				'Licensed under the <a href="https://github.com/kezza2k7/open-grind/blob/main/LICENSE">Personal Use Licence</a>.',
		},
	},
});
