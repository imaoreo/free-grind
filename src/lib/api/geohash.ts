import z from "zod";

const precision = 12;

export const geohashSchema = z
	.string()
	.length(precision)
	.regex(/^[0-9b-hjkmnp-z]+$/);

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number): string {
	let latLo = -90,
		latHi = 90;
	let lonLo = -180,
		lonHi = 180;
	let hash = "";
	let bits = 0,
		bit = 0,
		even = true;

	while (hash.length < precision) {
		if (even) {
			const mid = (lonLo + lonHi) / 2;
			if (lon >= mid) {
				bits = (bits << 1) | 1;
				lonLo = mid;
			} else {
				bits = bits << 1;
				lonHi = mid;
			}
		} else {
			const mid = (latLo + latHi) / 2;
			if (lat >= mid) {
				bits = (bits << 1) | 1;
				latLo = mid;
			} else {
				bits = bits << 1;
				latHi = mid;
			}
		}
		even = !even;
		if (++bit === 5) {
			hash += BASE32[bits];
			bits = 0;
			bit = 0;
		}
	}
	return hash;
}

export function decodeGeohash(hash: string): {
	lat: number;
	lon: number;
	latErr: number;
	lonErr: number;
} {
	let latLo = -90,
		latHi = 90;
	let lonLo = -180,
		lonHi = 180;
	let even = true;

	for (const ch of hash.toLowerCase()) {
		const idx = BASE32.indexOf(ch);
		if (idx < 0) throw new Error(`Invalid geohash char: ${ch}`);
		for (let b = 4; b >= 0; b--) {
			const bit = (idx >> b) & 1;
			if (even) {
				const mid = (lonLo + lonHi) / 2;
				if (bit) lonLo = mid;
				else lonHi = mid;
			} else {
				const mid = (latLo + latHi) / 2;
				if (bit) latLo = mid;
				else latHi = mid;
			}
			even = !even;
		}
	}
	return {
		lat: (latLo + latHi) / 2,
		lon: (lonLo + lonHi) / 2,
		latErr: (latHi - latLo) / 2,
		lonErr: (lonHi - lonLo) / 2,
	};
}
