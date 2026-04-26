import { useState } from "react";
import { ArrowLeft, Copy, Play, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import type {
	ApiFunctionDefinition,
	ApiFunctionName,
	ApiFunctionResult,
} from "../../types/api-functions";

const functionDefinitions: ApiFunctionDefinition[] = [
	{
		name: "getOwnAlbums",
		label: "getOwnAlbums()",
		description: "Load your own albums from /v1/albums.",
	},
	{
		name: "getOwnAlbumDetails",
		label: "getOwnAlbumDetails(albumId)",
		description: "Load one album and its content from /v2/albums/{albumId}.",
	},
	{
		name: "getOwnAlbumStorage",
		label: "getOwnAlbumStorage()",
		description: "Load album limits from /v1/albums/storage.",
	},
];

export function ApiFunctionsPage() {
	const navigate = useNavigate();
	const api = useApiFunctions();

	const [albumId, setAlbumId] = useState("1");
	const [running, setRunning] = useState<ApiFunctionName | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<string>("Run a function to see a typed JSON result here.");

	const runFunction = async <T extends ApiFunctionName>(
		name: T,
		runner: () => Promise<ApiFunctionResult<T>>,
	) => {
		setRunning(name);
		setError(null);
		try {
			const value = await runner();
			setResult(JSON.stringify(value, null, 2));
		} catch (runError) {
			const message =
				runError instanceof Error ? runError.message : "Function call failed";
			setError(message);
			setResult(JSON.stringify({ error: message }, null, 2));
		} finally {
			setRunning(null);
		}
	};

	const handleCopy = async () => {
		await navigator.clipboard.writeText(result);
	};

	const reset = () => {
		setError(null);
		setResult("Run a function to see a typed JSON result here.");
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-6xl gap-4">
				<header className="grid gap-3 sm:flex sm:items-end sm:justify-between">
					<div className="grid gap-2">
						<Button type="button" onClick={() => navigate("/settings")} className="w-fit">
							<ArrowLeft className="h-4 w-4" />
							Back to Settings
						</Button>
						<h1 className="app-title">API Functions</h1>
						<p className="app-subtitle">
							Run typed API helper functions and inspect the JSON output.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="button" onClick={handleCopy}>
							<Copy className="h-4 w-4" />
							Copy Output
						</Button>
						<Button type="button" onClick={reset}>
							<RotateCcw className="h-4 w-4" />
							Reset
						</Button>
					</div>
				</header>

				<div className="grid gap-4 lg:grid-cols-[360px_1fr]">
					<Card className="grid gap-3 p-4">
						{functionDefinitions.map((definition) => (
							<div key={definition.name} className="rounded-xl border border-[var(--border)] p-3">
								<p className="text-sm font-semibold">{definition.label}</p>
								<p className="mt-1 text-xs text-[var(--text-muted)]">{definition.description}</p>

								{definition.name === "getOwnAlbumDetails" ? (
									<div className="mt-2 grid gap-2">
										<label className="text-xs font-semibold text-[var(--text-muted)]">
											Album ID
										</label>
										<input
											type="text"
											value={albumId}
											onChange={(event) => setAlbumId(event.target.value)}
											className="input-field"
											placeholder="1"
										/>
									</div>
								) : null}

								<Button
									type="button"
									className="mt-3 w-full"
									disabled={running !== null}
									onClick={() => {
										if (definition.name === "getOwnAlbums") {
											void runFunction("getOwnAlbums", () => api.getOwnAlbums());
											return;
										}
										if (definition.name === "getOwnAlbumDetails") {
											void runFunction("getOwnAlbumDetails", () =>
												api.getOwnAlbumDetails(albumId.trim() || "1"),
											);
											return;
										}
										void runFunction("getOwnAlbumStorage", () =>
											api.getOwnAlbumStorage(),
										);
									}}
								>
									<Play className="h-4 w-4" />
									{running === definition.name ? "Running..." : `Run ${definition.name}`}
								</Button>
							</div>
						))}
					</Card>

					<Card className="grid gap-3 p-4">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
								Function Output
							</p>
							{error ? (
								<p className="mt-2 text-sm text-red-300">{error}</p>
							) : (
								<p className="mt-2 text-sm text-[var(--text-muted)]">
									Output is parsed by schemas and shown as formatted JSON.
								</p>
							)}
						</div>
						<pre className="max-h-[65vh] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs text-[var(--text)]">
							{result}
						</pre>
					</Card>
				</div>
			</div>
		</section>
	);
}
