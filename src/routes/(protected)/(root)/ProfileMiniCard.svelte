<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { UserIcon } from "phosphor-svelte";

	let {
		id,
		displayName,
		age,
		distance,
		medias,
	}: {
		id: number;
		displayName: string | null;
		age: number | null;
		distance: number | null;
		medias: { mediaHash: string }[] | null;
	} = $props();

	const profilePicture = $derived(medias?.[0]);
</script>

<a href="/profile/{id}" class="aspect-square relative flex items-end">
	<div class="absolute w-full h-full bg-stone-700">
		{#if medias && profilePicture}
			<img
				src="https://cdns.grindr.com/images/thumb/320x320/{profilePicture.mediaHash}"
				alt="Profile avatar"
				class="w-full h-full"
				loading="lazy"
			/>
		{:else}
			<UserIcon
				weight="fill"
				color="var(--color-stone-400)"
				class="size-3/4 top-1/2 left-1/2 -translate-1/2 absolute"
			/>
		{/if}
	</div>
	{#if distance}
		<Badge class="absolute top-2 right-2 bg-popover/20 backdrop-blur-2xl" variant="outline">
			{distance}m
		</Badge>
	{/if}
	<div class="w-full z-1 flex p-0.5 gap-0.5">
		{#if displayName !== null || age !== null}
			<Badge variant="secondary" class="gap-0 max-w-full">
				{#if displayName !== null}
					<span class="truncate block shrink font-semibold">
						{displayName}
					</span>
				{/if}
				{#if displayName !== null && age !== null}
					,&nbsp;
				{/if}
				{#if age !== null}
					<span class="truncate line-clamp-1 block max-w-full shrink-0">
						{age}
					</span>
				{/if}
			</Badge>
		{/if}
	</div>
</a>
