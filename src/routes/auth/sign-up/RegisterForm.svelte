<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";
</script>

<Alert.Root class="w-full max-w-sm m-auto">
	<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
	<Alert.Title>Unimplemented</Alert.Title>
	<Alert.Description>
		Registration is not implemented yet, track <a
			href="https://git.hloth.dev/hloth/open-grind/issues/21"
			target="_blank"
			rel="noopener noreferrer"
		>
			#21
		</a>.
		<Button
			variant="link"
			href="/auth/sign-in"
			class="px-0 size-fit mbs-1 block"
		>
			Sign In
		</Button>
	</Alert.Description>
</Alert.Root>
