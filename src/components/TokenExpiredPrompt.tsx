import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { useAuth } from "../contexts/useAuth";

export function TokenExpiredPromptView({ onSignOut }: { onSignOut: () => void }) {
	const { t } = useTranslation();

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
						<KeyRound className="h-9 w-9 text-[var(--accent)]" />
					</div>
					<h1 className="text-2xl font-bold text-[var(--text)]">{t("token_expired.title")}</h1>
					<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
						{t("token_expired.description")}
					</p>
				</div>

				<div
					className="flex h-44 shrink-0 flex-col justify-end gap-2 px-6"
					style={{ paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 12px))" }}
				>
					<button
						type="button"
						onClick={onSignOut}
						className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						{t("token_expired.sign_out")}
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Gates the routed app behind a full-page "your login token expired" prompt —
 * same slot in the tree as OutdatedVersionGate/TestReminderGate in App.tsx,
 * not a floating overlay. Only ever triggered for third-party (JWT) logins:
 * those have no real refresh mechanism, so once the token itself expires the
 * backend surfaces AppError::TokenExpired instead of the usual generic auth
 * error (see useApi.ts's asAppError + AuthContext's fg:token-expired
 * listener). Email/password sessions always have a working refresh token and
 * never hit this path.
 */
export function TokenExpiredGate({ children }: { children: ReactNode }) {
	const { tokenExpired, logout } = useAuth();

	if (!tokenExpired) {
		return <>{children}</>;
	}

	return (
		<div className="app-shell">
			<TokenExpiredPromptView onSignOut={() => void logout()} />
		</div>
	);
}
