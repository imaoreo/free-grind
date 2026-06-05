import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { GeocodeResult, SelectedLocation } from "../../GridPage.types";
import { LeafletLocationPicker } from "./LeafletLocationPicker";

type LocationSettingsPanelProps = {
	locationQuery: string;
	onLocationQueryChange: (value: string) => void;
	isSearchingLocation: boolean;
	locationResults: GeocodeResult[];
	onChooseLocation: (lat: number, lon: number, label: string) => void;
	selectedLocation: SelectedLocation | null;
	onMapPick: (lat: number, lon: number) => void;
	onMapPickerError: (message: string) => void;
	mapPickerError: string | null;
	initialCenter?: [number, number];
};

export function LocationSettingsPanel({
	locationQuery,
	onLocationQueryChange,
	isSearchingLocation,
	locationResults,
	onChooseLocation,
	selectedLocation,
	onMapPick,
	onMapPickerError,
	mapPickerError,
	initialCenter,
}: LocationSettingsPanelProps) {
	const { t } = useTranslation();

	return (
		<div className="surface-card mb-4 rounded-2xl p-4 sm:p-5">
			<div className="grid gap-3">
				<div className="grid gap-2">
					<label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
						{t("browse_location.search_label")}
					</label>
					<div className="relative">
						<input
							type="text"
							value={locationQuery}
							onChange={(event) => onLocationQueryChange(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.currentTarget.blur();
								}
							}}
							placeholder={t("browse_location.search_placeholder")}
							className="input-field"
						/>
						{isSearchingLocation && (
							<div className="absolute right-3 top-1/2 -translate-y-1/2">
								<Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
							</div>
						)}
					</div>
				</div>

				{locationResults.length > 0 && (
					<div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
						{locationResults.map((result) => (
							<button
								key={`${result.lat}:${result.lon}:${result.display_name}`}
								type="button"
								onClick={() =>
									onChooseLocation(
										Number(result.lat),
										Number(result.lon),
										result.display_name,
									)
								}
								className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] cursor-pointer"
							>
								{result.display_name}
							</button>
						))}
					</div>
				)}

				<div className="overflow-hidden rounded-xl border border-[var(--border)]">
					{mapPickerError ? (
						<div className="p-3 text-xs text-[var(--text-muted)]">
							{mapPickerError}
						</div>
					) : (
						<LeafletLocationPicker
							selectedLocation={selectedLocation}
							onPick={onMapPick}
							onError={onMapPickerError}
							defaultZoom={11}
							initialCenter={initialCenter}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
