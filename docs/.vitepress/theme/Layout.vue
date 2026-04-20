<script setup lang="ts">
import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { nextTick, provide } from "vue";

const { isDark } = useData();

const enableTransitions = () =>
	"startViewTransition" in document &&
	window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

provide("toggle-appearance", async () => {
	if (!enableTransitions()) {
		isDark.value = !isDark.value;
		return;
	}

	const switchEl = document.querySelector(".VPSwitchAppearance");
	if (switchEl instanceof HTMLElement) switchEl.style.visibility = "hidden";

	await document.startViewTransition(async () => {
		isDark.value = !isDark.value;
		await nextTick();
	}).ready;

	document.documentElement.animate(
		{ opacity: isDark.value ? [1, 0] : [0, 1] },
		{
			duration: 250,
			easing: "ease",
			fill: "forwards",
			pseudoElement: `::view-transition-${isDark.value ? "old" : "new"}(root)`,
		}
	);

	if (switchEl instanceof HTMLElement) switchEl.style.visibility = "visible";
});
</script>

<template>
	<DefaultTheme.Layout />
</template>

<style>
::view-transition-old(root),
::view-transition-new(root) {
	animation: none;
	mix-blend-mode: normal;
}

::view-transition-old(root),
.dark::view-transition-new(root) {
	z-index: 1;
}

::view-transition-new(root),
.dark::view-transition-old(root) {
	z-index: 9999;
}
</style>
