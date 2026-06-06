/**
 * CENTRAL CONFIGURATION
 * Tune the app's scrolling feel here.
 */
export const SMOOTH_SCROLL_CONFIG = {
	/**
	 * Whether smooth scrolling is active globally.
	 */
	enabled: false,

	/**
	 * Enable smooth scrolling on touch devices (mobile).
	 */
	smoothTouch: false,

	/**
	 * Animation duration in seconds.
	 */
	duration: undefined as number | undefined,

	/**
	 * How much the scroll distance is multiplied for wheel events.
	 */
	wheelMultiplier: 1.2,

	/**
	 * Multiplier for touch events if smoothTouch is true.
	 */
	touchMultiplier: 1.5,

	/**
	 * Linear interpolation (0 to 1). Lower is smoother/slower.
	 */
	lerp: 0.06,
} as const;
