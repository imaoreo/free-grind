import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function SignInPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { login } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		try {
			await login(email, password);
			navigate("/");
		} catch (error) {
			console.error("Login failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<section className="app-screen flex items-center justify-center">
			<div className="surface-card w-full max-w-md p-6 sm:p-8">
				<h1 className="app-title mb-2">Sign In</h1>
				<p className="app-subtitle mb-6">Welcome back to Open Grind.</p>
				<form onSubmit={handleSubmit} className="space-y-4">
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
					<button
						type="submit"
						disabled={isLoading}
						className="btn-accent w-full px-4 py-3"
					>
						{isLoading ? "Signing in..." : "Sign In"}
					</button>
				</form>
				<div className="mt-4 text-center">
					<Link
						to="/auth/sign-up"
						className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
					>
						Don't have an account? Sign up
					</Link>
				</div>
			</div>
		</section>
	);
}
