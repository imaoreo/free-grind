import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, RotateCcw, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
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
	const navigate = useNavigate();
	const [entries, setEntries] = useState<ApiTraceEntry[]>(() =>
		getApiTraceEntries(),
	);
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<"all" | "rest" | "command">("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);

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

	const selected =
		filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;

	useEffect(() => {
		if (!selected) {
			setSelectedId(null);
			return;
		}
		if (!selectedId || !filtered.some((entry) => entry.id === selectedId)) {
			setSelectedId(selected.id);
		}
	}, [filtered, selected, selectedId]);

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
		link.download = `open-grind-api-trace-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-7xl gap-4">
				<header className="grid gap-3 sm:flex sm:items-end sm:justify-between">
					<div className="grid gap-2">
						<Button type="button" onClick={() => navigate("/settings")} className="w-fit">
							<ArrowLeft className="h-4 w-4" />
							Back to Settings
						</Button>
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

				<div className="grid gap-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
					<Card className="max-h-[70vh] overflow-y-auto p-2">
						{filtered.length === 0 ? (
							<div className="p-4 text-sm text-[var(--text-muted)]">
								No entries yet. Perform actions in the app to capture requests.
							</div>
						) : (
							<div className="grid gap-1">
								{filtered.map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={() => setSelectedId(entry.id)}
										className={`rounded-lg border p-3 text-left transition ${
											selected?.id === entry.id
												? "border-[var(--accent)] bg-[var(--surface-2)]"
												: "border-transparent hover:border-[var(--border)]"
										}`}
									>
										<div className="mb-1 flex items-center justify-between gap-2">
											<p className="truncate text-sm font-semibold">
												{entry.method} {entry.path}
											</p>
											<span
												className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusClass(entry.status, entry.success)}`}
											>
												{entry.status ?? "ERR"}
											</span>
										</div>
										<p className="text-xs text-[var(--text-muted)]">
											{formatTimestamp(entry.timestamp)} · {entry.durationMs} ms · {entry.kind}
										</p>
									</button>
								))}
							</div>
						)}
					</Card>

					<Card className="max-h-[70vh] overflow-y-auto p-4">
						{selected ? (
							<div className="grid gap-4">
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
										Request
									</p>
									<p className="mt-1 text-sm font-semibold">
										{selected.method} {selected.path}
									</p>
									<p className="mt-1 text-xs text-[var(--text-muted)]">
										{new Date(selected.timestamp).toLocaleString()} · {selected.durationMs} ms
									</p>
								</div>

								<div>
									<p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
										Request Body
									</p>
									<pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text)]">
										{selected.requestBody ?? "(empty)"}
									</pre>
								</div>

								<div>
									<p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
										Response Body
									</p>
									<pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text)]">
										{selected.responseBody ?? "(empty)"}
									</pre>
								</div>

								{selected.error ? (
									<div>
										<p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
											Error
										</p>
										<pre className="overflow-x-auto rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
											{selected.error}
										</pre>
									</div>
								) : null}
							</div>
						) : (
							<div className="text-sm text-[var(--text-muted)]">Select an entry to inspect details.</div>
						)}
					</Card>
				</div>
			</div>
		</section>
	);
}
