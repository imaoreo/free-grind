import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Pencil, Plane, Plus } from "lucide-react";
import { CategoryHeader } from "./ProfileEditorComponents";
import { TravelPlanEditorSheet } from "./TravelPlanEditorSheet";
import { useTravelPlans } from "../../../hooks/queries/useProfileQueries";
import { reverseGeocodeGeohash } from "../gridpage/geocoding";
import { formatTravelDateRange } from "../gridpage/utils";
import type { TravelPlan } from "../../../types/travel";

function TravelPlanSummary({ plan }: { plan: TravelPlan }) {
	const { t } = useTranslation();
	const [location, setLocation] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void reverseGeocodeGeohash(plan.geohash).then((label) => {
			if (!cancelled) {
				setLocation(label);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [plan.geohash]);

	return (
		<div className="min-w-0 flex-1">
			<div className="flex items-center gap-2">
				<p className="truncate text-sm font-semibold text-[var(--text)]">
					{location ?? t("travel_plans.resolving_location")}
				</p>
				{!plan.showOnProfile && (
					<span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
						{t("travel_plans.hidden_badge")}
					</span>
				)}
			</div>
			<p className="mt-0.5 text-xs text-[var(--text-muted)]">
				{formatTravelDateRange(plan.startDate, plan.endDate)}
			</p>
		</div>
	);
}

type TravelPlansSectionProps = {
	profileId?: string | number | null;
};

export function TravelPlansSection({ profileId }: TravelPlansSectionProps) {
	const { t } = useTranslation();
	const numericProfileId = profileId != null ? Number(profileId) : null;
	const { data: travelPlans, isLoading } = useTravelPlans(numericProfileId);
	// undefined = sheet closed; null = creating a new plan; TravelPlan = editing that plan
	const [editingPlan, setEditingPlan] = useState<TravelPlan | null | undefined>(undefined);

	return (
		<div className="surface-card p-4 sm:p-5">
			<CategoryHeader
				title={t("travel_plans.section_title")}
				description={t("travel_plans.section_desc")}
				icon={Plane}
				action={
					<button
						type="button"
						onClick={() => setEditingPlan(null)}
						disabled={numericProfileId == null}
						className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-medium transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Plus className="h-4 w-4" />
						{t("travel_plans.add")}
					</button>
				}
			/>

			{isLoading ? (
				<div className="flex items-center justify-center py-6 text-[var(--text-muted)]">
					<Loader2 className="h-5 w-5 animate-spin" />
				</div>
			) : (travelPlans?.length ?? 0) === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-8 text-center">
					<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)]">
						<Plane className="h-4 w-4" />
					</div>
					<p className="text-sm text-[var(--text-muted)]">{t("travel_plans.empty")}</p>
				</div>
			) : (
				<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
					{travelPlans!.map((plan, i) => (
						<button
							key={plan.travelPlanId}
							type="button"
							onClick={() => setEditingPlan(plan)}
							className={`flex w-full items-center gap-3 bg-[var(--surface-2)] px-4 py-3.5 text-left transition hover:bg-[var(--surface-3,var(--surface))] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--accent)]">
								<Plane className="h-4 w-4" />
							</div>
							<TravelPlanSummary plan={plan} />
							<Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-60" />
						</button>
					))}
				</div>
			)}

			{editingPlan !== undefined && numericProfileId != null && (
				<TravelPlanEditorSheet
					profileId={numericProfileId}
					plan={editingPlan}
					onClose={() => setEditingPlan(undefined)}
				/>
			)}
		</div>
	);
}
