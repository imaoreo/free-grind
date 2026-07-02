import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";
import { BugReportButton } from "../../components/ui/BugReportButton";
import type { SignInMethod } from "../../types/auth";
import { useTranslation } from "react-i18next";
import { Mail, Lock, KeyRound, AlertCircle, ExternalLink, Eye, EyeOff } from "lucide-react";
import { cn } from "../../utils/cn";

function AuthMethodTab({
	active,
	icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97]",
				active
					? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md shadow-[var(--accent)]/25"
					: "text-[var(--text-muted)] hover:text-[var(--text)]",
			)}
		>
			{icon}
			{label}
		</button>
	);
}

function IconInput({
	icon,
	className,
	rightSlot,
	...inputProps
}: { icon: ReactNode; rightSlot?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
	return (
		<div className="group relative">
			<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors duration-150 group-focus-within:text-[var(--accent)]">
				{icon}
			</span>
			<input {...inputProps} className={cn("input-field pl-9", rightSlot && "pr-10", className)} />
			{rightSlot ? (
				<span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
			) : null}
		</div>
	);
}

function AuthSubmitSection({
	error,
	loading,
	disabled,
	loadingLabel,
	label,
}: {
	error: string | null;
	loading: boolean;
	disabled: boolean;
	loadingLabel: string;
	label: string;
}) {
	return (
		<>
			{error ? (
				<div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--border)_60%,#f87171_40%)] bg-[color-mix(in_srgb,var(--surface)_88%,#f87171_12%)] px-3 py-2.5 text-sm text-[var(--text)]">
					<AlertCircle className="h-4 w-4 shrink-0 text-[#f87171]" />
					<span>{error}</span>
				</div>
			) : null}
			<div className="pt-1">
				<Button
					type="submit"
					variant="primary"
					loading={loading}
					disabled={disabled}
					className="w-full"
				>
					{loading ? loadingLabel : label}
				</Button>
			</div>
		</>
	);
}

export function SignInPage() {
	const { t } = useTranslation();
	const [method, setMethod] = useState<SignInMethod>("password");

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);

	const [jwtToken, setJwtToken] = useState("");
	const [isTokenLoading, setIsTokenLoading] = useState(false);

	const { login, loginWithJwt, error } = useAuth();
	const navigate = useNavigate();

	const isPasswordFormValid = email.trim().length > 0 && password.trim().length > 0;
	const isTokenFormValid = jwtToken.trim().length > 0;

	const handlePasswordSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsPasswordLoading(true);
		try {
			await login(email, password);
			navigate("/");
		} catch {
			// AuthContext updates `error`, which is rendered in the form.
		} finally {
			setIsPasswordLoading(false);
		}
	};

	const handleTokenSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsTokenLoading(true);
		try {
			await loginWithJwt(jwtToken.trim());
			navigate("/");
		} catch {
			// AuthContext updates `error`, which is rendered in the form.
		} finally {
			setIsTokenLoading(false);
		}
	};

	return (
		<AuthShell
			title={t("auth.sign_in.title")}
			subtitle={t("auth.sign_in.subtitle")}
			footer={
				<div className="flex flex-col items-center gap-3">
					<Link
						to="/auth/sign-up"
						className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
					>
						{t("auth.sign_in.no_account")}
					</Link>
					<BugReportButton />
				</div>
			}
		>
			{/* Method selector */}
			<div className="mb-6 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1 shadow-sm">
				<AuthMethodTab
					active={method === "password"}
					icon={<Lock className="h-3.5 w-3.5" />}
					label={t("auth.sign_in.method_password")}
					onClick={() => setMethod("password")}
				/>
				<AuthMethodTab
					active={method === "token"}
					icon={<KeyRound className="h-3.5 w-3.5" />}
					label={t("auth.sign_in.method_token")}
					onClick={() => setMethod("token")}
				/>
			</div>

			{method === "password" ? (
				<form key="password" onSubmit={handlePasswordSubmit} className="animate-fade-in space-y-3">
					<IconInput
						icon={<Mail className="h-4 w-4" />}
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoFocus
						placeholder={t("auth.common.email")}
					/>
					<IconInput
						icon={<Lock className="h-4 w-4" />}
						type={showPassword ? "text" : "password"}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						placeholder={t("auth.common.password")}
						rightSlot={
							<button
								type="button"
								onClick={() => setShowPassword((prev) => !prev)}
								className="text-[var(--text-muted)] hover:text-[var(--text)]"
								tabIndex={-1}
								aria-label={
									showPassword
										? t("auth.common.hide_password")
										: t("auth.common.show_password")
								}
							>
								{showPassword ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						}
					/>
					<AuthSubmitSection
						error={error}
						loading={isPasswordLoading}
						disabled={!isPasswordFormValid}
						loadingLabel={t("auth.sign_in.signing_in")}
						label={t("auth.sign_in.submit")}
					/>
				</form>
			) : (
				<form key="token" onSubmit={handleTokenSubmit} className="animate-fade-in space-y-3">
					<div>
						<a
							href="https://freegrinddocs.imaoreo.dev/guide/login"
							target="_blank"
							rel="noreferrer"
							className="mb-2 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-[var(--accent)] hover:underline"
						>
							<ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{t("auth.sign_in.token_help")}</span>
						</a>
						<IconInput
							icon={<KeyRound className="h-4 w-4" />}
							type="text"
							value={jwtToken}
							onChange={(e) => setJwtToken(e.target.value)}
							required
							autoFocus
							placeholder="eyJhbGciOi..."
							autoComplete="off"
						/>
					</div>
					<AuthSubmitSection
						error={error}
						loading={isTokenLoading}
						disabled={!isTokenFormValid}
						loadingLabel={t("auth.sign_in.signing_in")}
						label={t("auth.sign_in.submit")}
					/>
				</form>
			)}
		</AuthShell>
	);
}
