import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { sexualPositionLabels } from "../../types/grid";
import type { InboxFilterKey } from "../../types/chat-page";

type ChatFiltersDraft = {
	unreadOnly: boolean;
	chemistryOnly: boolean;
	favoritesOnly: boolean;
	rightNowOnly: boolean;
	onlineNowOnly: boolean;
	distanceMeters: string;
	positions: number[];
};

const inboxFilterOptions: Array<{ key: InboxFilterKey; label: string }> = [
	{ key: "unreadOnly", label: "Unread" },
	{ key: "favoritesOnly", label: "Favorites" },
	{ key: "chemistryOnly", label: "Chemistry" },
	{ key: "rightNowOnly", label: "Right now" },
	{ key: "onlineNowOnly", label: "Online" },
];

const defaultChatFiltersDraft: ChatFiltersDraft = {
	unreadOnly: false,
	chemistryOnly: false,
	favoritesOnly: false,
	rightNowOnly: false,
	onlineNowOnly: false,
	distanceMeters: "",
	positions: [],
};

function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function parseDraftFromLocationState(state: unknown): {
	draft: ChatFiltersDraft;
	returnTo: string;
} {
	const safe =
		typeof state === "object" && state !== null
			? (state as {
					inboxFiltersDraft?: Partial<ChatFiltersDraft>;
					returnTo?: string;
			  })
			: {};
	const draft = safe.inboxFiltersDraft ?? {};

	return {
		draft: {
			unreadOnly: draft.unreadOnly === true,
			chemistryOnly: draft.chemistryOnly === true,
			favoritesOnly: draft.favoritesOnly === true,
			rightNowOnly: draft.rightNowOnly === true,
			onlineNowOnly: draft.onlineNowOnly === true,
			distanceMeters:
				typeof draft.distanceMeters === "string" ? draft.distanceMeters : "",
			positions: isNumberArray(draft.positions) ? draft.positions : [],
		},
		returnTo: typeof safe.returnTo === "string" ? safe.returnTo : "/chat",
	};
}

export function ChatFiltersPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const initialState = useMemo(
		() => parseDraftFromLocationState(location.state),
		[location.state],
	);
	const [filters, setFilters] = useState<ChatFiltersDraft>(initialState.draft);
	const positionFilterOptions = useMemo(
		() => [
			{ value: -1, label: "Not specified" },
			...Object.entries(sexualPositionLabels).map(([value, label]) => ({
				value: Number(value),
				label,
			})),
		],
		[],
	);

	const toggleFilter = (key: InboxFilterKey) => {
		setFilters((previous) => ({
			...previous,
			[key]: !previous[key],
		}));
	};

	const togglePosition = (positionId: number) => {
		setFilters((previous) => ({
			...previous,
			positions: previous.positions.includes(positionId)
				? previous.positions.filter((value) => value !== positionId)
				: [...previous.positions, positionId],
		}));
	};

	const applyAndReturn = () => {
		navigate(initialState.returnTo, {
			state: {
				inboxFiltersDraft: filters,
			},
		});
	};

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<header className="mb-4 flex items-center justify-between gap-3">
					<div className="inline-flex items-center gap-2">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							aria-label="Back"
						>
							<ArrowLeft className="h-4 w-4" />
						</button>
						<div>
							<h1 className="app-title">Chat Filters</h1>
							<p className="app-subtitle">Refine which conversations appear in inbox</p>
						</div>
					</div>
					<button
						type="button"
						onClick={applyAndReturn}
						className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						Apply
					</button>
				</header>

				<div className="surface-card space-y-4 p-4 sm:p-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							Quick filters
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{inboxFilterOptions.map((filter) => {
								const active = filters[filter.key];
								return (
									<button
										key={filter.key}
										type="button"
										onClick={() => toggleFilter(filter.key)}
										className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
											active
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										{filter.label}
									</button>
								);
							})}
						</div>
					</div>

					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							Distance
						</p>
						<div className="mt-2 grid grid-cols-1 gap-3 sm:max-w-xs">
							<input
								type="number"
								inputMode="decimal"
								min={0}
								placeholder="Max distance in meters"
								value={filters.distanceMeters}
								onChange={(event) =>
									setFilters((previous) => ({
										...previous,
										distanceMeters: event.target.value,
									}))
								}
								className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
							/>
						</div>
					</div>

					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							Sexual position
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
								{positionFilterOptions.map(({ value: positionId, label }) => {
								const active = filters.positions.includes(positionId);
								return (
									<button
										key={positionId}
										type="button"
										onClick={() => togglePosition(positionId)}
										className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
											active
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
						<button
							type="button"
							onClick={() => setFilters(defaultChatFiltersDraft)}
							className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						>
							Clear all
						</button>
						<button
							type="button"
							onClick={applyAndReturn}
							className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
						>
							Apply
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}