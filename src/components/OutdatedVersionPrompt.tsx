import { useEffect, useMemo, useState } from "react";

const DEFAULT_RELEASES_URL = "https://github.com/imaoreo/free-grind/releases";
const DEFAULT_LATEST_VERSION = "0.5.3";
const TARGET_OUTDATED_VERSIONS = new Set(["0.5.0", "0.5.1", "5.0.0", "5.1.0"]);

type ReleaseInfo = {
    latestVersion: string;
    releasesUrl: string;
};

function normalizeVersion(value: string): string {
    return value.trim().replace(/^v/i, "");
}

function isOlderVersion(currentVersion: string, latestVersion: string): boolean {
    const currentParts = currentVersion.split(".").map(Number);
    const latestParts = latestVersion.split(".").map(Number);

    const maxLength = Math.max(currentParts.length, latestParts.length);

    for (let i = 0; i < maxLength; i++) {
        const a = currentParts[i] || 0;
        const b = latestParts[i] || 0;

        if (a < b) return true;
        if (a > b) return false;
    }

    return false;
}

function isTargetOutdatedVersion(value: string, releaseInfo: ReleaseInfo): boolean {
    const normalizedVersion = normalizeVersion(value);
    
    if (TARGET_OUTDATED_VERSIONS.has(normalizedVersion)) {
        return true;
    }

    return isOlderVersion(normalizedVersion, releaseInfo.latestVersion);
}

function buildDismissStorageKey(appVersion: string): string {
    return `outdated-version-dismissed-${normalizeVersion(appVersion)}`;
}

function processDismissCountdown(key: string): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    const storedValue = window.localStorage.getItem(key);
    
    if (!storedValue) {
        return false; 
    }

    let reopensRemaining = parseInt(storedValue, 10);
    if (isNaN(reopensRemaining)) {
        return false;
    }

    reopensRemaining -= 1;

    if (reopensRemaining <= 0) {
        // Countdown finished! Remove the flag so the prompt shows again.
        window.localStorage.removeItem(key);
        return false; 
    } else {
        // Save the new countdown number
        window.localStorage.setItem(key, reopensRemaining.toString());
    }

    // If we have reopens remaining, it is still considered "dismissed"
    return reopensRemaining > 0;
}

function writeDismissedFlag(key: string, reopens: number = 5): void {
    try {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(key, reopens.toString());
        }
    } catch (error) {
        console.warn("Failed to write to localStorage:", error);
    }
}

async function fetchLatestRelease(signal: AbortSignal): Promise<ReleaseInfo> {
    const response = await fetch(
        "https://api.github.com/repos/imaoreo/free-grind/releases/latest",
        {
            headers: {
                Accept: "application/vnd.github+json",
            },
            signal,
        },
    );

    if (!response.ok) {
        throw new Error(`GitHub release lookup failed (${response.status})`);
    }

    const payload = (await response.json()) as {
        name?: string;
        html_url?: string;
    };

    const parts = payload.name?.split(" ") ?? [];
    const version = parts[2]?.replace("v", "") ?? "";

    return {
        latestVersion:
            typeof version === "string" && version.length > 0
                ? normalizeVersion(version)
                : DEFAULT_LATEST_VERSION,
        releasesUrl:
            typeof payload.html_url === "string" && payload.html_url.length > 0
                ? payload.html_url
                : DEFAULT_RELEASES_URL,
    };
}

export function OutdatedVersionPrompt() {
    const appVersion = import.meta.env.VITE_APP_VERSION ?? "unknown";
    const normalizedAppVersion = normalizeVersion(appVersion);
    const dismissStorageKey = useMemo(
        () => buildDismissStorageKey(appVersion),
        [appVersion],
    );
    
    const [isDismissed, setIsDismissed] = useState(() =>
        processDismissCountdown(dismissStorageKey)
    );
    
    const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);

    useEffect(() => {
        if (isDismissed) {
            return;
        }

        const controller = new AbortController();
        void fetchLatestRelease(controller.signal)
            .then((latest) => {
                setReleaseInfo(latest);
            })
            .catch(() => {
                setReleaseInfo({
                    latestVersion: DEFAULT_LATEST_VERSION,
                    releasesUrl: DEFAULT_RELEASES_URL,
                });
            });

        return () => {
            controller.abort();
        };
    }, [isDismissed]);

    const isVisible = useMemo(() => {
        if (isDismissed || !releaseInfo) {
            return false;
        }

        return isTargetOutdatedVersion(normalizedAppVersion, releaseInfo);
    }, [isDismissed, releaseInfo, normalizedAppVersion]);

    if (!isVisible || !releaseInfo) {
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
					You are currently using FreeGrind {normalizedAppVersion}, which is
					outdated.
				</p>
				<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
					The latest available version is {releaseInfo.latestVersion}. You can
					download it from the official releases page.
				</p>
				<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						onClick={() => {
							writeDismissedFlag(dismissStorageKey, 5);
							setIsDismissed(true);
						}}
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
					>
						Dismiss
					</button>
					<a
						href={releaseInfo.releasesUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						Get {releaseInfo.latestVersion}
					</a>
				</div>
			</div>
		</div>
	);
}
