<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import type { LatLng } from "leaflet";
	import * as Drawer from "$lib/components/ui/drawer/index";
	import * as Dialog from "$lib/components/ui/dialog";
	import GeoMapPicker from "$lib/components/location-chooser/GeoMapPicker.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { encodeGeohash } from "$lib/api/geohash";

	let {
		onSubmit,
		open = $bindable(),
	}: {
		onSubmit: (geohash: string) => void;
		open: boolean;
	} = $props();

	const isDesktop = new MediaQuery("(min-width: 768px)");

	let pinPos: LatLng | undefined = $state();

	function onSubmitPin() {
		if (!pinPos) return;
		const geohash = encodeGeohash(pinPos.lat, pinPos.lng);
		open = false;
		void onSubmit(geohash);
	}
</script>

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content
			class="sm:max-w-200 h-[calc(100%-4rem)] flex flex-col"
			preventOverflowTextSelection={false}
			showCloseButton={false}
		>
			<div
				class="h-full touch-manipulation rounded-lg overflow-clip flex-1"
				data-vaul-no-drag
			>
				<GeoMapPicker bind:pinPos />
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>
					Save
				</Button>
				<!-- <Dialog.Close class={buttonVariants({ variant: "outline" })}>
						Cancel
					</Dialog.Close> -->
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Content
			preventOverflowTextSelection={false}
			class="h-full max-h-dvh!"
		>
			<div
				class="h-full touch-manipulation rounded-lg overflow-clip mt-4 mb-2"
				data-vaul-no-drag
			>
				<GeoMapPicker bind:pinPos />
			</div>
			<Drawer.Footer class="pt-2">
				<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>
					Save
				</Button>
				<!-- <Drawer.Close class={buttonVariants({ variant: "outline" })}>
						Cancel
					</Drawer.Close> -->
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
{/if}
