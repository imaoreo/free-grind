/**
 * Centralized duration for a Right Now session.
 * Standard: 60 minutes (3600000 ms)
 * Test Mode: Change to 1 * 60 * 1000 for 1 minute
 */
export const RIGHT_NOW_SESSION_DURATION = 60 * 60 * 1000;
export const RIGHT_NOW_TEST_SESSION_DURATION = 1 * 60 * 1000;

export function getRightNowSessionDuration(isTestMode: boolean): number {
	return isTestMode ? RIGHT_NOW_TEST_SESSION_DURATION : RIGHT_NOW_SESSION_DURATION;
}
