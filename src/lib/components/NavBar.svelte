<script>
	import { goto } from "$app/navigation";
	import * as Tabs from "$lib/components/ui/tabs";
	import DotsNineIcon from "phosphor-svelte/lib/DotsNineIcon";
	import DropIcon from "phosphor-svelte/lib/DropIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";

	let tab = $state("browse");

	$effect(() => {
		switch (tab) {
			case "browse":
				goto("/");
				break;
			case "right-now":
				goto("/right-now");
				break;
			case "interest":
				goto("/interest");
				break;
			case "inbox":
				goto("/chat");
				break;
		}
	});
</script>

<nav class="fixed bottom-2 left-1/2 -translate-x-1/2">
	<Tabs.Root bind:value={tab}>
		<Tabs.List class="*:flex *:flex-col *:gap-0.5 [&>button>svg]:size-5!">
			<Tabs.Trigger value="browse">
				<DotsNineIcon weight="fill" />
				Browse
			</Tabs.Trigger>
			<Tabs.Trigger value="right-now">
				<DropIcon weight="fill" />
				Right Now
			</Tabs.Trigger>
			<Tabs.Trigger value="interest">
				<FireIcon weight="fill" />
				Interest
			</Tabs.Trigger>
			<Tabs.Trigger value="inbox">
				<ChatCircleIcon weight="fill" />
				Inbox
			</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>
</nav>
