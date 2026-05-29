/**
 * UI Constants for timing, caching and behavior.
 */

/**
 * Time duration for which the scroll position of a feed is remembered in sessionStorage.
 * If the user returns to the page after this timeout, the scroll position will reset to the top.
 *
 * Currently used in:
 * - InterestPage (Views & Taps)
 * - RightNowPage
 */
export const SCROLL_RESTORATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * React Query: Default stale time for data fetching.
 * Defines how long the fetched data is considered "fresh" before a background refetch is triggered on next usage.
 *
 * Currently used in:
 * - useInterestData (Interest Page)
 * - useRightNowFeed (Right Now Page)
 */
export const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * React Query: Default garbage collection time.
 * Defines how long unused or inactive query data remains in the cache before being deleted from memory.
 *
 * Currently used in:
 * - main.tsx (Global QueryClient default)
 */
export const DEFAULT_GC_TIME_MS = 5 * 60 * 1000; // 5 minutes
