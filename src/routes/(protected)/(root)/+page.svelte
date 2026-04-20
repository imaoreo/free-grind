<script lang="ts">
	import { getPreferences } from "$lib/app-data/preferences.svelte";
	import LocationChooser from "./LocationEmpty.svelte";
	import LocationChange from "./LocationChange.svelte";
	import Grid from "./Grid.svelte";

	let preferences = $state(getPreferences());
</script>

<svelte:head>
	<title>Open Grind</title>
</svelte:head>
{#await preferences then { geohash }}
	{#if geohash === null}
		<main class="min-h-dvh">
			<div class="m-auto flex min-h-dvh pb-16">
				<LocationChooser onUpdate={() => (preferences = getPreferences())} />
			</div>
		</main>
	{:else}
		<main class="min-h-dvh flex flex-col p-4 gap-4">
			<LocationChange onUpdate={() => (preferences = getPreferences())} />
			<Grid {geohash} />
		</main>
	{/if}
{/await}
