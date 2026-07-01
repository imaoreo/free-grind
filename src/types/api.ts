import z from "zod";

export const methodSchemas = {
	login: {
		request: z.object({
			email: z.email(),
			password: z.string().min(1),
		}),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	login_with_jwt: {
		request: z.object({
			token: z.string().min(1),
		}),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	auth_state: {
		request: z.undefined(),
		response: z.number().int().nonnegative().nullable(),
	},
	websocket_token: {
		request: z.undefined(),
		response: z.string().min(1).nullable(),
	},
	sync_push_token: {
		request: z.object({
			token: z.string().min(1),
		}),
		response: z.undefined(),
	},
	logout: {
		request: z.undefined(),
		response: z.undefined(),
	},
	list_saved_accounts: {
		request: z.undefined(),
		// profileId stays a string here (unlike login/login_with_jwt's
		// coerced number) since it round-trips straight back into
		// switch_account/remove_saved_account's profile_id: String param —
		// keeping it a string end to end avoids a number<->string mismatch
		// at that call site (callMethod does no runtime parsing, so nothing
		// would coerce it back anyway).
		response: z.array(
			z.object({
				profileId: z.string(),
				email: z.string(),
				lastUsedAt: z.coerce.number().int().nonnegative(),
			}),
		),
	},
	switch_account: {
		request: z.object({
			profileId: z.string(),
		}),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	remove_saved_account: {
		request: z.object({
			profileId: z.string(),
		}),
		response: z.undefined(),
	},
} as const satisfies Record<
	string,
	{ request: z.ZodType; response: z.ZodType }
>;

export type MethodName = keyof typeof methodSchemas;

export interface AppError {
	kind: "Http" | "Auth" | "Api" | "NotInitialized";
	message?: string | { code: number; message: string };
	prettyMessage: string;
}
