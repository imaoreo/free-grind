import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import z from "zod";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any }
	? Omit<T, "children">
	: T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

type StringRecord = Record<string, string>;

function schemaToStringRecord<T extends z.ZodObject>(
	schema: T,
	data: z.output<T>,
): StringRecord {
	const result: StringRecord = {};
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null) continue;
		if (typeof value === "boolean") result[key] = value ? "true" : "false";
		else result[key] = String(value);
	}
	return result;
}

function stringRecordToValues<T extends z.ZodObject>(
	schema: T,
	record: StringRecord,
): Record<string, unknown> {
	const shape = schema.shape;
	const result: Record<string, unknown> = {};
	for (const [key, fieldSchema] of Object.entries(shape)) {
		if (!(key in record)) continue;
		const raw = record[key];
		const inner = unwrapSchema(fieldSchema as z.ZodType);
		if (inner instanceof z.ZodNumber) result[key] = Number(raw);
		else if (inner instanceof z.ZodBoolean)
			result[key] = raw === "true" || raw === "1";
		else if (inner instanceof z.ZodBigInt) result[key] = BigInt(raw);
		else result[key] = raw;
	}
	return result;
}

function unwrapSchema(s: z.ZodType): z.ZodType {
	if (s instanceof z.ZodOptional || s instanceof z.ZodNullable)
		return unwrapSchema(s.unwrap() as z.ZodType);
	if (s instanceof z.ZodDefault) return unwrapSchema(s.unwrap() as z.ZodType);
	return s;
}

export function urlSearchParamsCodec<T extends z.ZodObject>(schema: T) {
	return z.codec(z.instanceof(URLSearchParams), schema, {
		decode(params: URLSearchParams) {
			const record: StringRecord = {};
			for (const [key, value] of params) record[key] = value;
			const coerced = stringRecordToValues(schema, record);
			return coerced as z.input<T>;
		},
		encode(data: z.input<T>) {
			return new URLSearchParams(
				schemaToStringRecord(schema, data as z.output<T>),
			);
		},
	} as {
		decode: (value: URLSearchParams) => z.input<T>;
		encode: (value: z.input<T>) => URLSearchParams;
	});
}
