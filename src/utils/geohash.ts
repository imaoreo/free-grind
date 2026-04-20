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
	lat: [number, number];
	lon: [number, number];
} {
	let latLo = -90,
		latHi = 90;
	let lonLo = -180,
		lonHi = 180;
	let even = true;

	for (let i = 0; i < hash.length; i++) {
		const idx = BASE32.indexOf(hash[i]);
		if (idx === -1) throw new Error("Invalid geohash");

		for (let mask = 16; mask > 0; mask >>= 1) {
			if (even) {
				const mid = (lonLo + lonHi) / 2;
				if (idx & mask) {
					lonLo = mid;
				} else {
					lonHi = mid;
				}
			} else {
				const mid = (latLo + latHi) / 2;
				if (idx & mask) {
					latLo = mid;
				} else {
					latHi = mid;
				}
			}
			even = !even;
		}
	}

	return {
		lat: [latLo, latHi],
		lon: [lonLo, lonHi],
	};
}
