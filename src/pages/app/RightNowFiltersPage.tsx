import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RangeSlider } from "../../components/ui/range-slider";
import { sexualPositionLabels } from "../../types/grid";
import { cn } from "../../utils/cn";
import {
	loadRightNowFiltersDraft,
	type RightNowFiltersDraft,
} from "./rightnow-filters-storage";

function parseState(state: unknown): {
	draft: RightNowFiltersDraft;
	returnTo: string;
} {
	const persisted = loadRightNowFiltersDraft();

	if (typeof state !== "object" || state === null) {
		return {
			draft: {
				ageMin: persisted.ageMin,
				ageMax: persisted.ageMax,
				positionFilter: persisted.positionFilter,
			},
			returnTo: "/right-now",
		};
	}

	const safe = state as {
		rightNowFiltersDraft?: Partial<RightNowFiltersDraft>;
		returnTo?: string;
	};
	const draft = safe.rightNowFiltersDraft ?? {};
	const ageMin =
		typeof draft.ageMin === "number" && Number.isFinite(draft.ageMin)
			? Math.max(18, Math.min(102, draft.ageMin))
			: persisted.ageMin;
	const ageMaxRaw =
		typeof draft.ageMax === "number" && Number.isFinite(draft.ageMax)
			? Math.max(18, Math.min(102, draft.ageMax))
			: persisted.ageMax;

	return {
		draft: {
			ageMin,
			ageMax: Math.max(ageMin, ageMaxRaw),
			positionFilter:
				typeof draft.positionFilter === "string"
					? draft.positionFilter
					: persisted.positionFilter,
		},
		returnTo: typeof safe.returnTo === "string" ? safe.returnTo : "/right-now",
	};
}

const positionFilterOptions = [
	{ value: "", label: "Any" },
	...Object.entries(sexualPositionLabels)
		.sort(([left], [right]) => Number(left) - Number(right))
		.map(([value, label]) => ({ value, label })),
];

export function RightNowFiltersPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const initialState = useMemo(() => parseState(location.state), [location.state]);

	const [ageMin, setAgeMin] = useState(initialState.draft.ageMin);
	const [ageMax, setAgeMax] = useState(initialState.draft.ageMax);
	const [positionFilter, setPositionFilter] = useState(initialState.draft.positionFilter);

	const applyAndReturn = () => {
		navigate(initialState.returnTo, {
			state: {
				rightNowFiltersDraft: {
					ageMin,
					ageMax,
					positionFilter,
				},
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
							<h1 className="app-title">Right Now Filters</h1>
							<p className="app-subtitle">Refine the Right Now feed</p>
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

				<div className="surface-card space-y-5 p-4 sm:p-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							Position
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{positionFilterOptions.map((option) => (
								<button
									key={option.value || "any"}
									type="button"
									onClick={() => setPositionFilter(option.value)}
									className={cn(
										"rounded-full border px-3 py-1 font-medium transition",
										option.value === positionFilter
											? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
											: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]",
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<RangeSlider
						label="Age Range"
						min={18}
						max={102}
						step={1}
						minDefault={ageMin}
						maxDefault={ageMax}
						onChange={(min, max) => {
							setAgeMin(min);
							setAgeMax(max);
						}}
					/>
				</div>
			</div>
		</section>
	);
}
