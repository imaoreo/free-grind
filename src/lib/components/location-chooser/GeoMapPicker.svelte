<script lang="ts">
	import { Map, TileLayer, Marker, ControlAttribution } from "sveaflet";
	import type { Map as LeafletMap, LeafletMouseEventHandlerFn } from "leaflet";
	import { divIcon } from "leaflet";
	import { GpsFixIcon } from "phosphor-svelte";
	import toast from "svelte-french-toast";
	import Button from "$lib/components/ui/button/button.svelte";
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import { platform } from "@tauri-apps/plugin-os";
	import { Input } from "$lib/components/ui/input";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import Alert from "$lib/components/ui/alert/alert.svelte";
	import { fetchRest } from "$lib/api";
	import z from "zod";

	let {
		pinPos = $bindable(),
	}: {
		pinPos?: { lat: number; lng: number };
	} = $props();

	let map: LeafletMap | undefined = $state();

	$effect(() => {
		if (map) {
			const onMapClick: LeafletMouseEventHandlerFn = (e) => {
				pinPos = e.latlng;
			};
			map.on("click", onMapClick);
			return () => {
				map?.off("click", onMapClick);
			};
		}
	});

	let searchQuery = $state("");
	let showSearchResults = $state(false);
	let searchPlaces = $derived.by(async () => {
		try {
			let query = searchQuery.trim();
			if (!query) return;
			const abortController = new AbortController();
			const response = await fetchRest(
				"/v3/places/search?" +
					new URLSearchParams({
						placeName: query,
					}),
				{ abortController },
			)
				.then((res) => res.json())
				.then((data) =>
					z
						.object({
							places: z.array(
								z.object({
									name: z.string(),
									address: z.string().nullable(),
									lat: z.number(),
									lon: z.number(),
									importance: z.number(),
								}),
							),
						})
						.parse(data),
				);
			return response;
		} catch (e) {
			console.error(e);
			toast.error("Failed to search places");
		}
	});
</script>

<div class="w-[inherit] h-[inherit] relative">
	<Map
		options={{ center: [51.505, -0.09], zoom: 13, attributionControl: false }}
		bind:instance={map}
	>
		<TileLayer
			url={"https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
			options={{
				maxZoom: 19,
				attribution:
					'&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer nofollow noopener">OpenStreetMap</a> &nbsp;',
				// do not enable: https://github.com/Leaflet/Leaflet/issues/6195
				// detectRetina: true,
			}}
		/>
		<ControlAttribution options={{ prefix: undefined }} />

		{#if pinPos}
			<Marker
				latLng={pinPos}
				options={{
					draggable: true,
					icon: divIcon({
						html: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>',
						iconAnchor: [20, 40],
						iconSize: [40, 40],
						className: "",
					}),
				}}
			/>
		{/if}
	</Map>
	<div class="absolute bottom-4 w-full z-1010 p-2">
		<Input
			id="search-place"
			type="search"
			placeholder="Search places..."
			bind:value={
				() => searchQuery,
				(v) => {
					searchQuery = v;
					showSearchResults = true;
				}
			}
			class=" bg-popover-foreground text-background shadow-md"
			maxlength={100}
			onfocus={() => {
				if (searchQuery.trim()) {
					showSearchResults = true;
				}
			}}
		/>
		<!-- bottom-2 w-[calc(100%-8rem)]  -->
	</div>
	{#if showSearchResults}
		<div class="size-full z-1000 top-0 left-0 absolute p-1 pb-16">
			<div
				class="bg-popover-foreground backdrop-blur-xl w-full h-full rounded-md flex flex-col text-popover shadow-md px-1 py-3 overflow-auto gap-2"
			>
				{#await searchPlaces}
					<Spinner class="m-auto size-8" />
				{:then response}
					{#if response}
						{#each response.places.toSorted((a, b) => b.importance - a.importance) as place}
							<Button
								class="flex flex-col gap-0 items-start justify-start text-current cursor-pointer text-left h-auto"
								variant="link"
								onclick={() => {
									pinPos = { lat: place.lat, lng: place.lon };
									map?.setView([place.lat, place.lon], 17);
									showSearchResults = false;
								}}
							>
								<span class="max-w-full block truncate line-clamp-1">
									{place.name}
								</span>
								<span
									class="max-w-full block truncate line-clamp-1 text-sm text-popover/40"
								>
									{place.address}
								</span>
							</Button>
						{/each}
					{/if}
				{:catch error}
					<Alert>{error}</Alert>
				{/await}
			</div>
		</div>
	{/if}
	{#if ["android", "ios"].includes(platform())}
		<div class="absolute bottom-6 right-2 z-1010 rounded-full">
			<Button
				size="icon-lg"
				aria-label="Locate me"
				variant="default"
				class="cursor-pointer bg-white text-black hover:bg-neutral-100 shadow-sm"
				onclick={async () => {
					if (map) {
						let permissions = await checkPermissions();
						if (
							permissions.location === "prompt" ||
							permissions.location === "prompt-with-rationale"
						) {
							permissions = await requestPermissions(["location"]);
						}
						if (permissions.location === "granted") {
							const pos = await getCurrentPosition();
							map.setView([pos.coords.latitude, pos.coords.longitude], 13);
						} else {
							toast.error(
								"Location permission denied. Change this in your system settings to use this button.",
							);
						}
					}
				}}
			>
				<GpsFixIcon weight="fill" class="size-6" />
			</Button>
		</div>
	{/if}
</div>
