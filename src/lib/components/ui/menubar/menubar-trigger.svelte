<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.TriggerProps = $props();
</script>

<MenubarPrimitive.Trigger
	bind:ref
	data-slot="menubar-trigger"
	class={cn("hover:bg-muted aria-expanded:bg-muted rounded-2xl px-2 py-0.75 text-sm font-medium flex items-center outline-hidden select-none", className)}
	{...restProps}
/>
