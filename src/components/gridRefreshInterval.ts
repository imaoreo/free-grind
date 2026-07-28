// Automatic grid refresh is a fixed, always-on part of the app (not a
// user-configurable setting) — shared by GridPage's own interval and
// GridAutoRefreshBridge's background heartbeat so both stay in lockstep.
export const GRID_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
