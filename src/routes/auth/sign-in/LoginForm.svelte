<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import { Input } from "$lib/components/ui/input";
	import * as Card from "$lib/components/ui/card";
	import { asAppError, callMethod } from "$lib/api";
	import toast from "svelte-french-toast";
	import z from "zod";
	import { goto } from "$app/navigation";

	let email = $state("");
	let password = $state("");
	let submitting = $state(false);
</script>

<form
	onsubmit={async (event) => {
		event.preventDefault();
		try {
			submitting = true;
			const result = await callMethod("login", {
				email,
				password,
			});
			goto("/");
		} catch (e) {
			console.error(e);
			const appError = asAppError(e);
			if (appError) {
				if (
					z
						.object({
							kind: z.string("Api"),
							message: z.object({
								code: z.literal(4),
								message: z.string("Invalid input parameters"),
							}),
						})
						.safeParse(appError).success
				) {
					toast.error("Invalid email or password");
				} else {
					toast.error(appError.prettyMessage);
				}
			} else {
				toast.error("An unknown error occurred");
			}
		} finally {
			submitting = false;
		}
	}}
	class="contents"
>
	<Card.Root class="w-full max-w-sm m-auto">
		<Card.Header>
			<Card.Title>Login to your account</Card.Title>
			<Card.Description>
				Enter your email below to login to your account
			</Card.Description>
			<Card.Action>
				<Button variant="link" href="/auth/sign-up" class="px-0">
					Sign Up
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-6">
				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						type="email"
						placeholder="m@example.com"
						required
						bind:value={email}
						disabled={submitting}
					/>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center">
						<Label for="password">Password</Label>
						<a
							href="/auth/password-reset"
							class="ms-auto inline-block text-sm underline-offset-4 hover:underline"
						>
							Forgot your password?
						</a>
					</div>
					<Input
						id="password"
						type="password"
						required
						autocomplete="current-password"
						bind:value={password}
						disabled={submitting}
					/>
				</div>
			</div>
		</Card.Content>
		<Card.Footer class="flex-col gap-2">
			<Button type="submit" class="w-full" disabled={submitting}>Login</Button>
			<!-- <Button variant="outline" class="w-full">Login with Google</Button> -->
		</Card.Footer>
	</Card.Root>
</form>
