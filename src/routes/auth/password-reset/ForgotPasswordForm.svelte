<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";
</script>

<Alert.Root class="w-full max-w-sm m-auto">
	<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
	<Alert.Title>Unimplemented</Alert.Title>
	<Alert.Description>
		Password reset is not implemented yet, track <a
			href="https://github.com/kezza2k7/open-grind/issues/1"
			target="_blank"
			rel="noopener noreferrer"
		>
			#1
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
