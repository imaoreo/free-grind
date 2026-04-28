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

	title: "Free Grind",
	description: "Free Grind project documentation and Grindr API reference",
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
						{ text: "Why Free Grind", link: "/guide/why-free-grind" },
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
			{ icon: "github", link: "https://github.com/kezza2k7/free-grind" },
			{ icon: "discord", link: "https://discord.gg/cJqTaWPMFF" },
			{
				icon: {
					svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
				},
				link: "https://t.me/opengrind",
			},
		],

		footer: {
			message: "Free Grind is not affiliated with Grindr in any way.",
			copyright:
				'Licensed under the <a href="https://github.com/kezza2k7/free-grind/blob/main/LICENSE">Personal Use Licence</a>.',
		},
	},
});
