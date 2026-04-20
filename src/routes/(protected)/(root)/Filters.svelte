<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Sheet from "$lib/components/ui/sheet";
	import { buttonVariants } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { SlidersHorizontalIcon } from "phosphor-svelte";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Slider } from "$lib/components/ui/slider";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	let favorites = $state(false);
	let online = $state(false);
	let rightNow = $state(false);
	let ageEnabled = $state(false);
	let age = $state([18, 102]);
	let genderEnabled = $state(false);
	let positionEnabled = $state(false);
	let positions: string[] = $state([]);
</script>

<div class="flex w-full">
	<Sheet.Root open>
		<Sheet.Trigger class={buttonVariants({ variant: "secondary" })}>
			<SlidersHorizontalIcon />
		</Sheet.Trigger>
		<Sheet.Content
			side="bottom"
			showCloseButton={false}
			preventOverflowTextSelection={false}
		>
			<Sheet.Header class="p-4">
				<Sheet.Title>Filters</Sheet.Title>
			</Sheet.Header>
			<div class="grid grid-cols-1 sm:grid-rows-6 gap-4 flex-1 auto-rows-max px-4 w-full sm:grid-flow-col">
				<div class="flex items-center gap-3 w-full">
					<Checkbox id="filters-favorite" bind:checked={favorites} />
					<Label for="filters-favorite">Favorites</Label>
				</div>
				<div class="flex items-center gap-3 w-full">
					<Checkbox id="filters-online" bind:checked={online} />
					<Label for="filters-online">Online</Label>
				</div>
				<div class="flex items-center gap-3 w-full">
					<Checkbox id="filters-right-now" bind:checked={rightNow} />
					<Label for="filters-right-now">Right now</Label>
				</div>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-3 w-full max-w-lg">
						<Checkbox id="filters-age" bind:checked={ageEnabled} />
						<Label for="filters-age">Age</Label>
						<span class="ml-auto min-w-0 truncate">
							{#if age[1] === 102}
								{age[0]} years & over
							{:else}
								{age[0]} - {age[1]}
							{/if}
						</span>
					</div>
					<div class="w-full max-w-lg ps-7">
						<Slider
							type="multiple"
							bind:value={age}
							min={18}
							max={102}
							step={1}
							class="w-full"
						/>
					</div>
				</div>
				<div class="flex items-center gap-3 w-full">
					<Checkbox id="filters-gender" bind:checked={genderEnabled} />
					<Label for="filters-gender">Gender</Label>
				</div>
				<div class="flex flex-col gap-2">
					<div class="flex items-center gap-3 w-full">
						<Checkbox id="filters-position" bind:checked={positionEnabled} />
						<Label for="filters-position">Position</Label>
					</div>
					<div class="ps-7">
						<ToggleGroup.Root
							type="multiple"
							variant="outline"
							spacing={2}
							class="flex-wrap w-full gap-1"
							bind:value={positions}
						>
							<ToggleGroup.Item value="top">Top</ToggleGroup.Item>
							<ToggleGroup.Item value="vers-top">Vers Top</ToggleGroup.Item>
							<ToggleGroup.Item value="vers">Versatile</ToggleGroup.Item>
							<ToggleGroup.Item value="vers-bottom"
								>Vers Bottom</ToggleGroup.Item
							>
							<ToggleGroup.Item value="bottom">Bottom</ToggleGroup.Item>
							<ToggleGroup.Item value="side">Side</ToggleGroup.Item>
							<ToggleGroup.Item value="not-specified">
								Not Specified
							</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
				</div>
			</div>
			<Sheet.Footer class="p-4 items-end">
				<Button type="submit" class="max-w-lg">Apply</Button>
			</Sheet.Footer>
		</Sheet.Content>
	</Sheet.Root>
</div>
