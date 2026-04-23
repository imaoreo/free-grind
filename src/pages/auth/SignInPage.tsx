import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";
import { googleClientId, startGoogleOAuthRedirect } from "../../utils/googleOAuth";

export function SignInPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);
	const [isGoogleLoading, setIsGoogleLoading] = useState(false);
	const { login, error } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsPasswordLoading(true);
		try {
			await login(email, password);
			navigate("/");
		} catch (error) {
			console.error("Login failed:", error);
		} finally {
			setIsPasswordLoading(false);
		}
	};

	return (
		<AuthShell
			title="Sign In"
			subtitle="Welcome back to Open Grind."
			footer={
				<Link
					to="/auth/sign-up"
					className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
				>
					Don&apos;t have an account? Sign up
				</Link>
			}
		>
			<form onSubmit={handleSubmit} className="space-y-4">
				<Button
					type="button"
					variant="secondary"
					loading={isGoogleLoading}
					onClick={() => {
						setIsGoogleLoading(true);
						startGoogleOAuthRedirect();
					}}
					disabled={!googleClientId}
					className="w-full"
				>
					{isGoogleLoading ? "Connecting to Google..." : "Continue with Google"}
				</Button>
				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<div className="w-full border-t border-[var(--border)]" />
					</div>
					<div className="relative flex justify-center text-xs uppercase tracking-wide text-[var(--text-muted)]">
						<span className="bg-[var(--bg)] px-2">or</span>
					</div>
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
						Email
					</label>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						className="input-field"
						placeholder="your@email.com"
					/>
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
						Password
					</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						className="input-field"
						placeholder="••••••••"
					/>
				</div>
				{error ? (
					<p className="text-sm text-[var(--text-muted)]">{error}</p>
				) : null}
				<Button
					type="submit"
					variant="primary"
					loading={isPasswordLoading}
					className="w-full"
				>
					{isPasswordLoading ? "Signing in..." : "Sign In"}
				</Button>
			</form>
		</AuthShell>
	);
}
