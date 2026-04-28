import { invoke } from '@tauri-apps/api/core';
import { listen, type Event, type UnlistenFn } from '@tauri-apps/api/event';

/** Download progress reported during `applyUpdate()` or `downloadUpdate()`. All sizes are in bytes. */
export interface DownloadProgress {
	/** Number of bytes downloaded so far. */
	downloaded: number;
	/** Total bundle size in bytes, or null if the server did not provide Content-Length. */
	total: number | null;
}

/**
 * Lifecycle event emitted on the `hotswap://lifecycle` channel.
 * Common event names: check-start, check-complete, check-error,
 * download-start, download-complete, download-error, apply, rollback, ready-confirmed.
 */
export interface LifecycleEvent {
	event: string;
	version?: string | null;
	sequence?: number | null;
	error?: string | null;
}

/** Result of a `checkUpdate()` call. */
export interface HotswapCheckResult {
	available: boolean;
	version: string | null;
	sequence: number | null;
	notes: string | null;
	/** Whether this update is mandatory (e.g. security patch). */
	mandatory: boolean | null;
	/** Bundle size in bytes, if provided by the server. */
	bundle_size: number | null;
}

/** Information about the currently active (or a previously installed) bundle version. */
export interface HotswapVersionInfo {
	version: string | null;
	sequence: number;
	binary_version: string;
	active: boolean;
}

/** Runtime configuration snapshot. */
export interface RuntimeConfig {
	/** Active update channel, or null for default. */
	channel: string | null;
	/** Runtime endpoint override, or null for init-time value. */
	endpoint: string | null;
	/** Custom HTTP headers sent on check and download requests. */
	headers: Record<string, string>;
}

/** Options for updating runtime configuration. All fields are optional — only provided fields are applied. */
export interface ConfigureOptions {
	/** Set the update channel. Pass null to clear. */
	channel?: string | null;
	/** Override the endpoint URL. Pass null to revert to init-time value. */
	endpoint?: string | null;
	/** Merge headers: keys with null values are removed, others are set/overwritten. Existing headers not mentioned are kept. */
	headers?: Record<string, string | null>;
}

/**
 * Check for an available update.
 */
export async function checkUpdate(): Promise<HotswapCheckResult> {
	return invoke<HotswapCheckResult>('plugin:hotswap|hotswap_check');
}

/**
 * Download, verify, extract, and activate the pending update in one step.
 * Call `checkUpdate()` first. Returns the new version string.
 *
 * For more control, use `downloadUpdate()` + `activateUpdate()` instead.
 *
 * The update is NOT confirmed automatically — call `notifyReady()` on
 * the next app launch. If not called, the next launch will auto-rollback.
 */
export async function applyUpdate(): Promise<string> {
	return invoke<string>('plugin:hotswap|hotswap_apply');
}

/**
 * Download and verify the pending update WITHOUT activating it.
 * Use this for "download now, apply later" workflows.
 *
 * Call `activateUpdate()` when you're ready to swap.
 */
export async function downloadUpdate(): Promise<string> {
	return invoke<string>('plugin:hotswap|hotswap_download');
}

/**
 * Activate a previously downloaded update.
 * The new assets will be served after a reload or next launch.
 */
export async function activateUpdate(): Promise<string> {
	return invoke<string>('plugin:hotswap|hotswap_activate');
}

/**
 * Roll back to the previous version or embedded assets.
 */
export async function rollback(): Promise<HotswapVersionInfo> {
	return invoke<HotswapVersionInfo>('plugin:hotswap|hotswap_rollback');
}

/**
 * Get current version info.
 */
export async function getVersionInfo(): Promise<HotswapVersionInfo> {
	return invoke<HotswapVersionInfo>('plugin:hotswap|hotswap_current_version');
}

/**
 * Confirm the current version works. Call this on every app startup.
 * If not called, the next launch auto-rollbacks to the previous version.
 */
export async function notifyReady(): Promise<void> {
	return invoke<void>('plugin:hotswap|hotswap_notify_ready');
}

/**
 * Update runtime configuration atomically.
 * Only provided fields are applied — omitted fields are left unchanged.
 *
 * @example
 * ```typescript
 * await configure({ channel: 'beta', headers: { 'Authorization': 'Bearer token' } });
 * ```
 */
export async function configure(options: ConfigureOptions): Promise<void> {
	return invoke<void>('plugin:hotswap|hotswap_configure', { ...options });
}

/**
 * Get the current runtime configuration snapshot.
 */
export async function getConfig(): Promise<RuntimeConfig> {
	return invoke<RuntimeConfig>('plugin:hotswap|hotswap_get_config');
}

/**
 * Listen for download progress events during `applyUpdate()` or `downloadUpdate()`.
 */
export async function onDownloadProgress(
	handler: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> {
	return listen<DownloadProgress>('hotswap://download-progress', (event: Event<DownloadProgress>) => {
		handler(event.payload);
	});
}

/**
 * Listen for lifecycle events (check-start, check-complete, download-start,
 * download-complete, download-error, apply, rollback, ready-confirmed).
 *
 * Use this to forward telemetry to your analytics backend.
 */
export async function onLifecycle(
	handler: (event: LifecycleEvent) => void,
): Promise<UnlistenFn> {
	return listen<LifecycleEvent>('hotswap://lifecycle', (event: Event<LifecycleEvent>) => {
		handler(event.payload);
	});
}
