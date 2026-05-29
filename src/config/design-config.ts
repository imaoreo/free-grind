/**
 * Design constants for live-tweaking gradients, masks and offsets.
 * These are separated to allow HMR (Hot Module Replacement) without full page reloads.
 */

export const FEED_HEADER_OFFSET = "8rem";
export const FEED_MASK_GRADIENT_STOP = "200px";

// --- Header Glow Design ---

// The point where the solid color starts to fade (increase for more "density" at the top)
export const HEADER_GLOW_COLOR_STOP_1 = "20%";
// The point where the color reaches its maximum transparency
export const HEADER_GLOW_COLOR_STOP_2 = "50%";

// Mask: 0% to STOP_1 is 100% visible (black), then fades until STOP_2 (transparent)
export const HEADER_GLOW_MASK_STOP_1 = "25%";
export const HEADER_GLOW_MASK_STOP_2 = "60%";

// --- Pull to Refresh Design ---

// The point where the content container stops moving down
export const PTR_CONTENT_STOP_PX = 64;
// The distance needed to trigger a refresh
export const PTR_THRESHOLD_PX = 64;
// The maximum distance the spinner can be pulled
export const PTR_MAX_PULL_PX = 140;
