import globals from "globals";
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import svelteConfig from "./svelte.config.js";

export default defineConfig(
	js.configs.recommended,
	ts.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: globals.node },
		rules: {
			"no-undef": "off",
		},
	},
	{
		files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: [".svelte"],
				parser: ts.parser,
				svelteConfig,
			},
		},
	},
);
