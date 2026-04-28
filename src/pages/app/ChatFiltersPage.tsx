import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { sexualPositionLabels } from "../../types/grid";
import type { InboxFilterKey } from "../../types/chat-page";
import { Slider } from "../../components/ui/range-slider";

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

/**
 * Predefined steps for the distance slider to allow non-linear progression
 * (finer steps for shorter distances, larger steps for further distances).
 */
const distanceSteps = [
	100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400,
	1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 3000, 3500,
	4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000,
	15000, 16000, 17000, 18000, 19000, 20000, 21000, 22000, 23000, 24000, 25000,
	30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000,
];

/**
 * Formats meter values into a human-readable string.
 * Values >= 75km are treated as "Unlimited" (75km+).
 */
const formatDistanceDisplay = (meters: number) => {
	if (meters >= 75000 || meters <= 0) return "75km+";
	if (meters < 1000) return `${meters}m`;
	const km = meters / 1000;
	return `${km}km`;
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

	// Distance Slider mapping logic:
	// We map the string meter value from state to an index in distanceSteps.
	// Empty string ("") corresponds to the maximum value (75km+ / No Filter).
	const currentDistanceMeters = filters.distanceMeters === "" ? 75000 : Number(filters.distanceMeters);
	const currentDistanceIndex = distanceSteps.indexOf(currentDistanceMeters);
	const displayDistanceIndex = currentDistanceIndex === -1 ? distanceSteps.length - 1 : currentDistanceIndex;

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
										className={`rounded-full border px-3 py-1 font-medium transition ${
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

					<Slider
						label="Max distance"
						min={0}
						max={distanceSteps.length - 1}
						defaultValue={displayDistanceIndex}
						displayValue={formatDistanceDisplay(currentDistanceMeters)}
						onChange={(index) => {
							const meters = distanceSteps[index];
							setFilters((previous) => ({
								...previous,
								// If the user selects the last step (75km), we send an empty string
								// to indicate "no distance filter" (Unlimited).
								distanceMeters: index === distanceSteps.length - 1 ? "" : String(meters),
							}));
						}}
					/>

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
										className={`rounded-full border px-3 py-1 font-medium transition ${
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