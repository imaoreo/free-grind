import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function SignUpPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		try {
			// Placeholder - actual signup logic would call backend
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Signup failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-gray-900">
			<div className="w-full max-w-md p-8 bg-gray-800 rounded-lg shadow">
				<h1 className="text-2xl font-bold text-white mb-6">Sign Up</h1>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-300 mb-2">
							Email
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
							placeholder="your@email.com"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-300 mb-2">
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
							placeholder="••••••••"
						/>
					</div>
					<button
						type="submit"
						disabled={isLoading}
						className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isLoading ? "Creating account..." : "Sign Up"}
					</button>
				</form>
				<div className="mt-4 text-center">
					<a
						href="/auth/sign-in"
						className="text-sm text-blue-400 hover:text-blue-300"
					>
						Already have an account? Sign in
					</a>
				</div>
			</div>
		</div>
	);
}
