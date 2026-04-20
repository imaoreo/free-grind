<script lang="ts">
	import toast from "svelte-french-toast";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import GpsFixIcon from "phosphor-svelte/lib/GpsFixIcon";
	import * as Empty from "$lib/components/ui/empty";
	import { Button } from "$lib/components/ui/button";
	import { encodeGeohash } from "$lib/api/geohash";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import { platform } from "@tauri-apps/plugin-os";
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";

	let {
		onUpdate,
	}: {
		onUpdate?: () => void;
	} = $props();

	let geoMapPickerOpen = $state(false);

	const geoApiSupported = $derived(["android", "ios"].includes(platform()));
	let disabled = $state(false);

	async function handleDetectLocation() {
		disabled = true;
		try {
			let permissions = await checkPermissions();
			if (
				permissions.location === "prompt" ||
				permissions.location === "prompt-with-rationale"
			) {
				permissions = await requestPermissions(["location"]);
			}
			if (permissions.location === "granted") {
				const {
					coords: { latitude, longitude },
				} = await getCurrentPosition();
				submitGeohash(encodeGeohash(latitude, longitude));
			} else {
				toast.error(
					"Location permission denied. Change this in your system settings to use this button.",
				);
			}
		} finally {
			disabled = false;
		}
	}

	function submitGeohash(geohash: string) {
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

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<NavigationArrowIcon weight="fill" color="var(--primary)" />
		</Empty.Media>
		<Empty.Title>Choose location</Empty.Title>
		<Empty.Description>
			Pick location on the map or select from the list to find nearby profiles.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex gap-2">
			{#if geoApiSupported}
				<Button variant="default" onclick={handleDetectLocation} disabled={disabled}>
					<GpsFixIcon color="currentColor" weight="fill" />
					Use current location
				</Button>
			{/if}
			<Button
				variant={geoApiSupported ? "outline" : "default"}
				onclick={() => (geoMapPickerOpen = true)}
			>
				<MagnifyingGlassIcon color="currentColor" weight="fill" />
				Pick manually
			</Button>
		</div>
	</Empty.Content>
	<!-- <Button variant="link" class="text-muted-foreground" size="sm">
		<a href="#/">
			Learn More <ArrowUpRightIcon class="inline" />
		</a>
	</Button> -->
</Empty.Root>
<LocationChooser onSubmit={submitGeohash} bind:open={geoMapPickerOpen} />
