<script lang="ts">
	import type z from "zod";
	import { onMount } from "svelte";
	import { searchProfiles, type searchProfileSchema } from "./grid";
	import { getPreferences } from "$lib/app-data/preferences.svelte";
	import ProfileMiniCard from "./ProfileMiniCard.svelte";
	import Filters from "./Filters.svelte";

	let {
		geohash,
	}: {
		geohash: string;
	} = $props();

	// <button
	// 	onclick={async () => {
	// 		const profile = await fetchRest("/v7/profiles/22323233");
	// 		console.log(await profile?.json());
	// 	}}>Fetch profile</button
	// >
	// <button
	// 	onclick={async () => {
	// 		await callMethod("logout");
	// 		goto("/auth/sign-in");
	// 	}}>Log out</button
	// >

	let profiles = $state(fetchProfiles());

	async function fetchProfiles() {
		try {
			return await searchProfiles({
				nearbyGeoHash: geohash,
			});
		} catch (e) {
			console.error(e);
			throw new Error("Failed to fetch profiles");
		}
	}
</script>

<Filters />
<div
	class="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 w-full gap-0.5 px-1"
>
	{#await profiles}
		{#each Array.from({ length: 20 })}
			<div class="aspect-square bg-stone-700 animate-pulse"></div>
		{/each}
	{:then { profiles }}
		{#each profiles as { displayName, age, distance, profileId, medias } (profileId)}
			<ProfileMiniCard id={profileId} {displayName} {age} {distance} {medias} />
		{/each}
	{/await}
</div>
