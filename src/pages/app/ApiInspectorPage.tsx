import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Download, RotateCcw, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { BackToSettings } from "../../components/BackToSettings";
import { Card } from "../../components/ui/card";
import { useApi } from "../../hooks/useApi";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import {
	clearApiTraceEntries,
	exportApiTraceEntries,
	getApiTraceEntries,
	subscribeApiTraceEntries,
	type ApiTraceEntry,
} from "../../services/apiTrace";

function formatTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function statusClass(status: number | null, success: boolean): string {
	if (!success) {
		return "bg-red-500/20 text-red-200 border-red-400/40";
	}
	if (status && status >= 200 && status < 300) {
		return "bg-green-500/20 text-green-200 border-green-400/40";
	}
	return "bg-yellow-500/20 text-yellow-200 border-yellow-400/40";
}

export function ApiInspectorPage() {
	const { asAppError } = useApi();
	const apiFunctions = useApiFunctions();
	const [entries, setEntries] = useState<ApiTraceEntry[]>(() =>
		getApiTraceEntries(),
	);
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<"all" | "rest" | "command">("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [composerMethod, setComposerMethod] = useState<
		"GET" | "POST" | "PUT" | "PATCH" | "DELETE"
	>("POST");
	const [composerPath, setComposerPath] = useState("/v1/albums");
	const [composerPayload, setComposerPayload] = useState("{\n  \"albumName\": \"My Album\"\n}");
	const [composerResponse, setComposerResponse] = useState<string>("");
	const [composerError, setComposerError] = useState<string>("");
	const [composerBusy, setComposerBusy] = useState(false);

	useEffect(() => {
		return subscribeApiTraceEntries(setEntries);
	}, []);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (kind !== "all" && entry.kind !== kind) {
				return false;
			}
			if (!needle) {
				return true;
			}
			const haystack = `${entry.method} ${entry.path} ${entry.status ?? ""} ${entry.error ?? ""}`.toLowerCase();
			return haystack.includes(needle);
		});
	}, [entries, kind, query]);

	const selected = filtered.find((entry) => entry.id === selectedId) ?? null;

	const copyResponseBody = (entry: ApiTraceEntry) => {
		if (entry.responseBody) {
			navigator.clipboard.writeText(entry.responseBody).catch(() => {});
			toast.success("Response body copied to clipboard", { id: "api-inspector-copy" });
		}
	};

	const toggleEntry = (entry: ApiTraceEntry) => {
		if (selectedId === entry.id) {
			setSelectedId(null);
			return;
		}
		setSelectedId(entry.id);
		copyResponseBody(entry);
	};

	useEffect(() => {
		if (selectedId && !filtered.some((entry) => entry.id === selectedId)) {
			setSelectedId(null);
		}
	}, [filtered, selectedId]);

	const handleCopy = async () => {
		if (!selected) {
			return;
		}
		await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
	};

	const handleExport = () => {
		const payload = exportApiTraceEntries();
		const blob = new Blob([payload], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `free-grind-api-trace-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const handleSendRequest = async () => {
		const path = composerPath.trim();
		if (!path.startsWith("/")) {
			setComposerError("Path must start with '/'. Example: /v1/albums");
			setComposerResponse("");
			return;
		}

		let parsedBody: unknown = undefined;
		const hasPayload = composerPayload.trim().length > 0;
		if (hasPayload) {
			try {
				parsedBody = JSON.parse(composerPayload);
			} catch {
				setComposerError(
					"Payload is not valid JSON. Fix syntax first (missing quotes/comma/braces).",
				);
				setComposerResponse("");
				return;
			}
		}

		setComposerBusy(true);
		setComposerError("");
		setComposerResponse("");

		try {
			const response = await apiFunctions.request(path, {
				method: composerMethod,
				...(hasPayload ? { body: parsedBody } : {}),
			});

			let prettyBody = "";
			try {
				prettyBody = JSON.stringify(response.json(), null, 2);
			} catch {
				prettyBody = response.text();
			}

			setComposerResponse(
				`Status ${response.status}\n\n${prettyBody || "(empty response body)"}`,
			);
			if (prettyBody) {
				await navigator.clipboard.writeText(prettyBody).catch(() => {});
				toast.success("Response body copied to clipboard", { id: "api-inspector-copy" });
			}
		} catch (error) {
			const appError = asAppError(error);
			const message = appError?.prettyMessage ??
				(error instanceof Error ? error.message : String(error));
			setComposerError(
				`${message}\n\nIf payload fields don't match the API schema, compare your JSON keys/types with endpoint docs and captured successful requests in the trace list.`,
			);
		} finally {
			setComposerBusy(false);
		}
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full min-w-0 max-w-4xl gap-4">
				<header className="grid gap-3 sm:flex sm:items-end sm:justify-between">
					<div className="grid gap-2">
					<BackToSettings />
						<h1 className="app-title">API Inspector</h1>
						<p className="app-subtitle">
							Inspect recent request and response history for REST and invoke commands.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" onClick={() => setEntries(getApiTraceEntries())}>
							<RotateCcw className="h-4 w-4" />
							Refresh
						</Button>
						<Button type="button" onClick={handleCopy} disabled={!selected}>
							<Copy className="h-4 w-4" />
							Copy Selected
						</Button>
						<Button type="button" onClick={handleExport}>
							<Download className="h-4 w-4" />
							Export
						</Button>
						<Button type="button" variant="danger" onClick={clearApiTraceEntries}>
							<Trash2 className="h-4 w-4" />
							Clear
						</Button>
					</div>
				</header>

				<Card className="p-4">
					<div className="mb-3 grid gap-1">
						<h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							Request Composer
						</h2>
						<p className="text-sm text-[var(--text-muted)]">
							Send manual REST calls (including POST) and validate JSON payloads before sending.
						</p>
					</div>

					<div className="grid gap-3 lg:grid-cols-[130px_1fr]">
						<select
							value={composerMethod}
							onChange={(event) =>
								setComposerMethod(
									event.target.value as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
								)
							}
							className="input-field"
						>
							<option value="GET">GET</option>
							<option value="POST">POST</option>
							<option value="PUT">PUT</option>
							<option value="PATCH">PATCH</option>
							<option value="DELETE">DELETE</option>
						</select>
						<input
							type="text"
							value={composerPath}
							onChange={(event) => setComposerPath(event.target.value)}
							placeholder="/v1/albums"
							className="input-field"
						/>
					</div>

					<div className="mt-3 grid gap-2">
						<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							JSON Payload (optional)
						</p>
						<textarea
							value={composerPayload}
							onChange={(event) => setComposerPayload(event.target.value)}
							rows={8}
							className="input-field min-h-[170px] font-mono text-xs"
							placeholder='{"key":"value"}'
						/>
						<div className="flex flex-wrap gap-2">
							<Button type="button" onClick={handleSendRequest} disabled={composerBusy}>
								{composerBusy ? "Sending..." : "Send Request"}
							</Button>
							<Button
								type="button"
								onClick={() => {
									setComposerPayload("");
									setComposerResponse("");
									setComposerError("");
								}}
							>
								Clear Payload
							</Button>
						</div>
					</div>

					{composerError ? (
						<pre className="mt-3 min-w-0 max-h-64 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
							{composerError}
						</pre>
					) : null}

					{composerResponse ? (
						<pre className="mt-3 min-w-0 max-h-64 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text)]">
							{composerResponse}
						</pre>
					) : null}
				</Card>

				<Card className="p-4">
					<div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
						<label className="relative block">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
							<input
								type="text"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Filter by path, method, status, or error"
								className="input-field pl-9"
							/>
						</label>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setKind("all")}
								className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
									kind === "all"
										? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]"
										: "border-[var(--border)] text-[var(--text-muted)]"
								}`}
							>
								All
							</button>
							<button
								type="button"
								onClick={() => setKind("rest")}
								className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
									kind === "rest"
										? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]"
										: "border-[var(--border)] text-[var(--text-muted)]"
								}`}
							>
								REST
							</button>
							<button
								type="button"
								onClick={() => setKind("command")}
								className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
									kind === "command"
										? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]"
										: "border-[var(--border)] text-[var(--text-muted)]"
								}`}
							>
								Invoke
							</button>
						</div>
					</div>
				</Card>

				<Card className="max-h-[70vh] min-w-0 overflow-y-auto p-2">
					{filtered.length === 0 ? (
						<div className="p-4 text-sm text-[var(--text-muted)]">
							No entries yet. Perform actions in the app to capture requests.
						</div>
					) : (
						<div className="grid min-w-0 gap-1">
							{filtered.map((entry) => {
								const isExpanded = selected?.id === entry.id;
								return (
									<div
										key={entry.id}
										className={`min-w-0 rounded-lg border transition ${
											isExpanded
												? "border-[var(--accent)] bg-[var(--surface-2)]"
												: "border-transparent hover:border-[var(--border)]"
										}`}
									>
										<button
											type="button"
											onClick={() => toggleEntry(entry)}
											className="w-full min-w-0 p-3 text-left"
										>
											<div className="mb-1 flex items-center justify-between gap-2">
												<p className="truncate text-sm font-semibold">
													{entry.method} {entry.path}
												</p>
												<div className="flex shrink-0 items-center gap-2">
													<span
														className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusClass(entry.status, entry.success)}`}
													>
														{entry.status ?? "ERR"}
													</span>
													<ChevronDown
														className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${
															isExpanded ? "rotate-180" : ""
														}`}
													/>
												</div>
											</div>
											<p className="text-xs text-[var(--text-muted)]">
												{formatTimestamp(entry.timestamp)} · {entry.durationMs} ms · {entry.kind}
											</p>
										</button>

										{isExpanded ? (
											<div className="grid min-w-0 gap-3 border-t border-[var(--border)] p-3">
												<div className="min-w-0">
													<p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
														Request Body
													</p>
													<pre className="min-w-0 max-h-64 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text)]">
														{entry.requestBody ?? "(empty)"}
													</pre>
												</div>

												<div className="min-w-0">
													<p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
														Response Body
													</p>
													<pre className="min-w-0 max-h-64 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text)]">
														{entry.responseBody ?? "(empty)"}
													</pre>
												</div>

												{entry.error ? (
													<div className="min-w-0">
														<p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															Error
														</p>
														<pre className="min-w-0 max-h-64 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
															{entry.error}
														</pre>
													</div>
												) : null}
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</Card>
			</div>
		</section>
	);
}
