import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../contexts/AuthContext";
import {
	consumeGoogleOAuthState,
	googleRedirectPath,
	parseGoogleOAuthHash,
} from "../../utils/googleOAuth";

export function GoogleCallbackPage() {
	const { loginWithGoogle } = useAuth();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function completeGoogleLogin() {
			const { accessToken, error, state } = parseGoogleOAuthHash(window.location.hash);
			window.history.replaceState({}, document.title, googleRedirectPath);

			if (error) {
				setError(`Google sign-in failed: ${error}`);
				return;
			}

			if (!consumeGoogleOAuthState(state)) {
				setError("Google sign-in failed: invalid OAuth state.");
				return;
			}

			if (!accessToken) {
				setError("Google sign-in failed: no access token returned.");
				return;
			}

			try {
				await loginWithGoogle(accessToken);
				navigate("/", { replace: true });
			} catch (error) {
				console.error("Google callback login failed:", error);
				setError("Google sign-in failed during session exchange.");
			}
		}

		void completeGoogleLogin();
	}, [loginWithGoogle, navigate]);

	return (
		<AuthShell
			title="Google Sign In"
			subtitle={error ? "Google sign-in did not complete." : "Finishing sign-in..."}
			footer={
				<Link
					to="/auth/sign-in"
					className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
				>
					Back to sign in
				</Link>
			}
		>
			<div className="space-y-4">
				{error ? <p className="text-sm text-[var(--text-muted)]">{error}</p> : null}
				{error ? (
					<Button type="button" variant="primary" className="w-full" onClick={() => navigate("/auth/sign-in", { replace: true })}>
						Return to Sign In
					</Button>
				) : (
					<Button type="button" variant="secondary" loading className="w-full">
						Exchanging Google token...
					</Button>
				)}
			</div>
		</AuthShell>
	);
}