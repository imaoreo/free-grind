import { Crosshair, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { GeocodeResult, SelectedLocation } from "../../GridPage.types";
import { LeafletLocationPicker } from "./LeafletLocationPicker";

type LocationSettingsPanelProps = {
	isVisible: boolean;
	isDetectingLocation: boolean;
	onUseCurrentLocation: () => void;
	locationQuery: string;
	onLocationQueryChange: (value: string) => void;
	isSearchingLocation: boolean;
	locationResults: GeocodeResult[];
	onChooseLocation: (lat: number, lon: number, label: string) => void;
	selectedLocation: SelectedLocation | null;
	isMapPickerOpen: boolean;
	mapPickerError: string | null;
	onToggleMapPicker: () => void;
	onMapPick: (lat: number, lon: number) => void;
	onMapPickerError: (message: string) => void;
	onUseSelectedLocation: () => void;
};

export function LocationSettingsPanel({
	isVisible,
	isDetectingLocation,
	onUseCurrentLocation,
	locationQuery,
	onLocationQueryChange,
	isSearchingLocation,
	locationResults,
	onChooseLocation,
	selectedLocation,
	isMapPickerOpen,
	mapPickerError,
	onToggleMapPicker,
	onMapPick,
	onMapPickerError,
	onUseSelectedLocation,
}: LocationSettingsPanelProps) {
	const { t } = useTranslation();

	if (!isVisible) {
		return null;
	}

	return (
		<div className="surface-card mb-4 rounded-2xl p-4 sm:p-5">
			<div className="mb-4">
				<p className="text-sm font-semibold">{t("browse_location.panel_title")}</p>
				<p className="text-xs text-[var(--text-muted)]">
					{t("browse_location.panel_subtitle")}
				</p>
			</div>

			<div className="grid gap-3">
				<button
					type="button"
					onClick={onUseCurrentLocation}
					disabled={isDetectingLocation}
					className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
				>
					{isDetectingLocation ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Crosshair className="h-4 w-4" />
					)}
					{isDetectingLocation
						? t("browse_location.detecting_location")
						: t("browse_location.use_current_location")}
				</button>

				<div className="grid gap-2">
					<label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
						{t("browse_location.search_label")}
					</label>
					<div className="relative">
						<input
							type="text"
							value={locationQuery}
							onChange={(event) => onLocationQueryChange(event.target.value)}
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
								className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left text-xs text-[var(--text-muted)]"
							>
								{result.display_name}
							</button>
						))}
					</div>
				)}

				{selectedLocation ? (
					<p className="text-xs text-[var(--text-muted)]">
						{t("browse_location.selected_label", { label: selectedLocation.label })}
					</p>
				) : null}

				<div className="overflow-hidden rounded-xl border border-[var(--border)]">
					<div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] p-2.5">
						<p className="text-xs font-semibold text-[var(--text-muted)]">
							{t("browse_location.map_picker_title")}
						</p>
						<button
							type="button"
							onClick={onToggleMapPicker}
							className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium"
						>
							{isMapPickerOpen ? t("browse_location.map_picker_hide") : t("browse_location.map_picker_open")}
						</button>
					</div>

					{isMapPickerOpen ? (
						mapPickerError ? (
							<div className="p-3 text-xs text-[var(--text-muted)]">
								{mapPickerError}
							</div>
						) : (
							<LeafletLocationPicker
								selectedLocation={selectedLocation}
								onPick={onMapPick}
								onError={onMapPickerError}
							/>
						)
					) : (
						<div className="p-3 text-xs text-[var(--text-muted)]">
							{t("browse_location.map_picker_instructions")}
						</div>
					)}

					<div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-2.5">
						<p className="text-xs text-[var(--text-muted)]">
							{t("browse_location.map_picker_tap_hint")}
						</p>
						<button
							type="button"
							disabled={!selectedLocation}
							onClick={onUseSelectedLocation}
							className="btn-accent rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
						>
							{t("browse_location.use_selected_location")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
