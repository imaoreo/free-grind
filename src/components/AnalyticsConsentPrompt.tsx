import { useMemo, useState } from "react";
import {
	readAnalyticsConsentChoice,
	writeAnalyticsConsentChoice,
} from "../utils/analyticsConsent";

export function AnalyticsConsentPrompt() {
	const [consentChoice, setConsentChoice] = useState(() =>
		readAnalyticsConsentChoice(),
	);

	const isVisible = useMemo(() => consentChoice === null, [consentChoice]);

	if (!isVisible) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			style={{
				paddingTop: "max(16px, env(safe-area-inset-top))",
				paddingBottom: "max(16px, env(safe-area-inset-bottom))",
			}}
		>
			<div className="surface-card w-full max-w-lg rounded-2xl p-5 sm:p-6">
				<h2 className="text-lg font-semibold text-[var(--text)] sm:text-xl">
					Help Improve FreeGrind
				</h2>
				<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
					Can we use anonymous analytics to improve the app? This powers finding
					other FreeGrind users and helps us understand usage trends.
				</p>
				<p className="mt-2 text-xs text-[var(--text-muted)]">
					No data is saved or tied to your device.
				</p>
				<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						onClick={() => {
							writeAnalyticsConsentChoice("denied");
							setConsentChoice("denied");
						}}
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
					>
						No Thanks
					</button>
					<button
						type="button"
						onClick={() => {
							writeAnalyticsConsentChoice("granted");
							setConsentChoice("granted");
						}}
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						Allow Analytics
					</button>
				</div>
			</div>
		</div>
	);
}
