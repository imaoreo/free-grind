<script lang="ts">
	import NavBar from "$lib/components/NavBar.svelte";

	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

{@render children?.()}
<NavBar />
