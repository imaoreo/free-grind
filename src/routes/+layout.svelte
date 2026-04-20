<script lang="ts">
	import "@fontsource-variable/ibm-plex-sans/wght.css";
	import "../layout.css";
	import favicon from "$lib/assets/favicon.png";
	import { Toaster } from "svelte-french-toast";
	import { IconContext } from "phosphor-svelte";

	let {
		children,
	}: {
		children?: import("svelte").Snippet;
	} = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<Toaster
	position="bottom-center"
	toastOptions={{
		style: "background-color: var(--accent); color: var(--popover)",
	}}
/>
<!-- TODO: migrate to svelte-sonner (svelte-french-toast is dead) -->
<IconContext values={{}}>
	{@render children?.()}
</IconContext>
