<script lang="ts">
	import toast from "svelte-french-toast";
	import { PencilSimpleIcon } from "phosphor-svelte";
	import { Button } from "$lib/components/ui/button";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";

	let {
		onUpdate,
	}: {
		onUpdate?: () => void;
	} = $props();

	let geoMapPickerOpen = $state(false);

	function onSubmit(geohash: string) {
		setPreferences({ geohash })
			.then(() => {
				geoMapPickerOpen = false;
				onUpdate?.();
			})
			.catch((e) => {
				console.error(e);
				toast.error("Failed to save location");
			});
	}
</script>

<Button
	variant="secondary"
	class="w-full"
	onclick={() => (geoMapPickerOpen = true)}
>
	<PencilSimpleIcon weight="fill" />
	Change location
</Button>
<LocationChooser {onSubmit} bind:open={geoMapPickerOpen} />
