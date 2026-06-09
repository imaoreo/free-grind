import { useMemo, useState } from "react";

const RELEASES_URL = "https://github.com/imaoreo/free-grind/releases";
const LATEST_VERSION = "0.5.2";
const OUTDATED_VERSION = "0.5.1";
const DISMISS_STORAGE_KEY = `outdated-version-dismissed-${OUTDATED_VERSION}`;

function readDismissedFlag(): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	return window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1";
}

function writeDismissedFlag(): void {
	window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
}

export function OutdatedVersionPrompt() {
	const appVersion = import.meta.env.VITE_APP_VERSION;
	const [isDismissed, setIsDismissed] = useState(() => readDismissedFlag());

	const isVisible = useMemo(() => {
		if (isDismissed) {
			return false;
		}

		return appVersion === OUTDATED_VERSION;
	}, [appVersion, isDismissed]);

	if (!isVisible) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4"
			style={{
				paddingTop: "max(16px, env(safe-area-inset-top))",
				paddingBottom: "max(16px, env(safe-area-inset-bottom))",
			}}
		>
			<div className="surface-card w-full max-w-lg rounded-2xl p-5 sm:p-6">
				<h2 className="text-lg font-semibold text-[var(--text)] sm:text-xl">
					Update Available
				</h2>
				<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
					You are currently using FreeGrind {OUTDATED_VERSION}, which is
					outdated.
				</p>
				<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
					The latest available version is {LATEST_VERSION}. You can download it
					from the official releases page.
				</p>
				<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						onClick={() => {
							writeDismissedFlag();
							setIsDismissed(true);
						}}
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
					>
						Dismiss
					</button>
					<a
						href={RELEASES_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						Get {LATEST_VERSION}
					</a>
				</div>
			</div>
		</div>
	);
}
