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
