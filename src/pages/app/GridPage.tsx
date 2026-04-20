import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export function GridPage() {
	const { userId, logout } = useAuth();
	const navigate = useNavigate();

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Logout failed:", error);
		}
	};

	return (
		<div className="min-h-screen bg-gray-900 p-4 pb-24">
			<div className="max-w-4xl mx-auto">
				<div className="text-white">
					<h1 className="text-3xl font-bold mb-4">Browse Profiles</h1>
					<p className="text-gray-400 mb-6">
						Profile Grid - This is where the main app content will go
					</p>
					<div className="bg-gray-800 rounded p-6">
						<p className="text-gray-300">
							Logged in as: <span className="font-semibold">{userId}</span>
						</p>
						<button
							onClick={handleLogout}
							className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
						>
							Logout
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
