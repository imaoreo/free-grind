import { ChevronRight, Download } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { processDismissCountdown, writeDismissedFlag } from "../utils/appStartDismissCountdown";

const DEFAULT_RELEASES_URL = "https://github.com/imaoreo/free-grind/releases";
const DEFAULT_LATEST_VERSION = "0.5.3";
const TARGET_OUTDATED_VERSIONS = new Set(["0.5.0", "0.5.1", "5.0.0", "5.1.0"]);
const OUTDATED_VERSION_REOPEN_COUNT = 5;

export type ReleaseInfo = {
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

export function OutdatedVersionPromptView({
	appVersion,
	releaseInfo,
	onDismiss,
}: {
	appVersion: string;
	releaseInfo: ReleaseInfo;
	onDismiss: () => void;
}) {
	return (
		<div className="fs-card-outer fs-card-overlay z-[110] no-touch-callout">
			<div className="fs-card-inner fs-card-lg flex flex-col">
				<div
					className="flex flex-1 flex-col items-center justify-center px-8 text-center"
					style={{
						paddingTop: "max(48px, env(safe-area-inset-top))",
						paddingBottom: "max(24px, env(safe-area-inset-bottom))",
					}}
				>
					<div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
						<Download className="h-9 w-9 text-[var(--accent)]" />
					</div>
					<h1 className="text-2xl font-bold text-[var(--text)]">Update Available</h1>
					<div className="flex flex-col items-center overflow-hidden">
						<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
							You're using Free Grind {appVersion}, which is outdated.
						</p>
						<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
							The latest version is {releaseInfo.latestVersion}.
						</p>
					</div>
				</div>

				<div
					className="flex h-44 shrink-0 flex-col justify-end gap-2 px-6"
					style={{ paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 12px))" }}
				>
					<a
						href={releaseInfo.releasesUrl}
						target="_blank"
						rel="noreferrer"
						className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						Get {releaseInfo.latestVersion}
						<ChevronRight className="h-4 w-4" />
					</a>
					<button
						type="button"
						onClick={onDismiss}
						className="w-full rounded-xl py-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
					>
						Dismiss
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Gates the routed app behind the outdated-version prompt — same slot in the
 * tree as onboarding/VersionAnnouncement/TestReminderGate in App.tsx, not a
 * floating overlay on top of the grid. That overlay approach left the card
 * transparent on mobile (fs-card-inner only gets a background at the 640px+
 * breakpoint), showing the grid bleeding through behind it.
 */
export function OutdatedVersionGate({ children }: { children: ReactNode }) {
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
        return <>{children}</>;
    }

	return (
		<div className="app-shell">
			<OutdatedVersionPromptView
				appVersion={normalizedAppVersion}
				releaseInfo={releaseInfo}
				onDismiss={() => {
					writeDismissedFlag(dismissStorageKey, OUTDATED_VERSION_REOPEN_COUNT);
					setIsDismissed(true);
				}}
			/>
		</div>
	);
}
