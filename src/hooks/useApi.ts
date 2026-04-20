import { invoke } from "@tauri-apps/api/core";
import { decode } from "@msgpack/msgpack";
import z from "zod";
import { useCallback } from "react";
import { methodSchemas, type MethodName, type AppError } from "../types/api";

export function useApi() {
	const callMethod = useCallback(async function <T extends MethodName>(
		method: T,
		...args: z.infer<(typeof methodSchemas)[T]["request"]> extends undefined
			? []
			: [data: z.infer<(typeof methodSchemas)[T]["request"]>]
	): Promise<z.infer<(typeof methodSchemas)[T]["response"]>> {
		return await invoke(method, args[0]);
	}, []);

	const asAppError = useCallback((error: unknown): AppError | null => {
		const { data, success } = z
			.object({
				kind: z.enum(["Http", "Auth", "Api", "NotInitialized"]),
				message: z
					.string()
					.or(
						z.object({
							code: z.number(),
							message: z.string(),
						}),
					)
					.optional(),
			})
			.safeParse(error);

		if (success) {
			let prettyMessage: string;
			if (typeof data.message === "string") {
				prettyMessage = data.message;
			} else if (data.message) {
				prettyMessage = `Error ${data.message.code}: ${data.message.message}`;
			} else {
				prettyMessage = "An unknown error occurred";
			}
			return { ...data, prettyMessage };
		}
		return null;
	}, []);

	const fetchRest = useCallback(
		async (
			path: string,
			options: {
				method?: string;
				body?: unknown;
				rawBody?: Uint8Array;
				contentType?: string;
				abortController?: AbortController;
			} = { method: "GET" },
		) => {
			try {
				if (options.body != null && options.rawBody != null) {
					throw new Error("Cannot provide both body and rawBody in fetchRest");
				}

				const packed = await invoke("request", {
					method: options.method || "GET",
					path,
					...(options.body != null && {
						body: Array.from(
							new TextEncoder().encode(JSON.stringify(options.body)),
						),
					}),
					...(options.rawBody != null && {
						body: Array.from(options.rawBody),
					}),
					...(options.contentType && { contentType: options.contentType }),
				}).then((res) => z.instanceof(ArrayBuffer).parse(res));

				const decoded = decode(packed);
				const { status, body } = z
					.object({ status: z.number(), body: z.instanceof(Uint8Array) })
					.parse(decoded);

				return {
					status,
					bytes() {
						return body;
					},
					text() {
						return new TextDecoder().decode(body);
					},
					json() {
						return JSON.parse(new TextDecoder().decode(body));
					},
				};
			} catch (error) {
				const appError = asAppError(error);
				if (appError) {
					throw appError;
				}
				throw error;
			}
		},
		[asAppError],
	);

	return { callMethod, asAppError, fetchRest };
}
