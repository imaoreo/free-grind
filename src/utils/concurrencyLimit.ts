/**
 * concurrencyLimit.ts — caps how many async jobs run at once.
 *
 * On Android, every Tauri IPC round-trip has to marshal its response back
 * into the WebView via a main-thread JS evaluation. chatDb reads that carry
 * base64 media/avatar bytes (getMediaFile, getMediaFileByMessageId,
 * getAvatar) are fired off in per-item render loops (one per message/avatar,
 * see mediaStore.ts and avatarStore.ts) with no queueing — opening a
 * conversation with a few hundred already-cached images/videos used to
 * dispatch that many concurrent invoke() calls in the same tick, and the
 * responses (each up to several MB of base64 text) would land back on the
 * main thread in a single burst, stalling it long enough to trip Android's
 * ANR watchdog. Capping concurrency spreads that same work over time instead
 * of changing what gets loaded.
 */

export function createLimiter(maxConcurrent: number): <T>(job: () => Promise<T>) => Promise<T> {
	let active = 0;
	const queue: (() => void)[] = [];

	function next(): void {
		if (active >= maxConcurrent) {
			return;
		}
		const run = queue.shift();
		if (run) {
			active += 1;
			run();
		}
	}

	return function limit<T>(job: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			queue.push(() => {
				job()
					.then(resolve, reject)
					.finally(() => {
						active -= 1;
						next();
					});
			});
			next();
		});
	};
}
