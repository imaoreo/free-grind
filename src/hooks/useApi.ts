import { invoke } from "@tauri-apps/api/core";
import { decode } from "@msgpack/msgpack";
import z from "zod";
import { useCallback } from "react";
import { methodSchemas, type MethodName, type AppError } from "../types/api";
import {
	addApiTraceEntry,
	toTracePreview,
} from "../services/apiTrace";

function traceId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useApi() {
	const callMethod = useCallback(async function <T extends MethodName>(
		method: T,
		...args: z.infer<(typeof methodSchemas)[T]["request"]> extends undefined
			? []
			: [data: z.infer<(typeof methodSchemas)[T]["request"]>]
	): Promise<z.infer<(typeof methodSchemas)[T]["response"]>> {
		const startedAt = Date.now();
		try {
			const result = await invoke(method, args[0]);
			addApiTraceEntry({
				id: traceId(),
				kind: "command",
				timestamp: startedAt,
				durationMs: Date.now() - startedAt,
				method: "INVOKE",
				path: String(method),
				status: 200,
				success: true,
				requestBody: toTracePreview(args[0]),
				responseBody: toTracePreview(result),
				error: null,
			});
			return result as z.infer<(typeof methodSchemas)[T]["response"]>;
		} catch (error) {
			addApiTraceEntry({
				id: traceId(),
				kind: "command",
				timestamp: startedAt,
				durationMs: Date.now() - startedAt,
				method: "INVOKE",
				path: String(method),
				status: null,
				success: false,
				requestBody: toTracePreview(args[0]),
				responseBody: null,
				error: toTracePreview(error),
			});
			throw error;
		}
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
			const startedAt = Date.now();
			const method = options.method || "GET";
			const requestPreview =
				toTracePreview(options.body) ??
				toTracePreview(options.rawBody) ??
				null;

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
				}).then((res) => {
					// Tauri delivers ArrayBuffer on most platforms, but on Windows it may
					// return a plain number[] array. Normalise to ArrayBuffer in both cases.
					if (res instanceof ArrayBuffer) return res;
					if (Array.isArray(res)) return new Uint8Array(res as number[]).buffer as ArrayBuffer;
					return z.instanceof(ArrayBuffer).parse(res);
				});

				const decoded = decode(packed);
				const { status, body } = z
					.object({ status: z.number(), body: z.instanceof(Uint8Array) })
					.parse(decoded);

				addApiTraceEntry({
					id: traceId(),
					kind: "rest",
					timestamp: startedAt,
					durationMs: Date.now() - startedAt,
					method,
					path,
					status,
					success: status >= 200 && status < 300,
					requestBody: requestPreview,
					responseBody: toTracePreview(body),
					error: null,
				});

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
				addApiTraceEntry({
					id: traceId(),
					kind: "rest",
					timestamp: startedAt,
					durationMs: Date.now() - startedAt,
					method,
					path,
					status: null,
					success: false,
					requestBody: requestPreview,
					responseBody: null,
					error: toTracePreview(appError ?? error),
				});

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
