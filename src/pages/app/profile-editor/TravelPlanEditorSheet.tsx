import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Check, ChevronDown, Loader2, Map, MapPin, Plane, Search, Trash2, X } from "lucide-react";
import z from "zod";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { ToggleRow } from "./ProfileEditorComponents";
import { MapLocationPicker } from "../gridpage/components/MapLocationPicker";
import { reverseGeocodeGeohash } from "../gridpage/geocoding";
import {
	useCreateTravelPlan,
	useDeleteTravelPlan,
	useUpdateTravelPlan,
} from "../../../hooks/queries/useProfileQueries";
import { encodeGeohash, decodeGeohash } from "../../../utils/geohash";
import { geocodeResultSchema, type GeocodeResult } from "../../../types/grid";
import type { TravelPlan } from "../../../types/travel";
import { formatDateInput, parseDateInput } from "./profileEditorUtils";

type SelectedLocation = { lat: number; lon: number; label: string };

type TravelPlanEditorSheetProps = {
	profileId: number;
	plan: TravelPlan | null;
	onClose: () => void;
};

export function TravelPlanEditorSheet({ profileId, plan, onClose }: TravelPlanEditorSheetProps) {
	const { t } = useTranslation();
	const isEditing = plan != null;

	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);

	const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
	const [locationQuery, setLocationQuery] = useState("");
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [lastSearchedQuery, setLastSearchedQuery] = useState("");
	const [isMapOpen, setIsMapOpen] = useState(false);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);

	const [startDate, setStartDate] = useState(() => formatDateInput(plan?.startDate ?? null));
	const [endDate, setEndDate] = useState(() => formatDateInput(plan?.endDate ?? null));
	const [notes, setNotes] = useState(plan?.notes ?? "");
	const [showOnProfile, setShowOnProfile] = useState(plan?.showOnProfile ?? true);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	const createTravelPlan = useCreateTravelPlan();
	const updateTravelPlan = useUpdateTravelPlan();
	const deleteTravelPlan = useDeleteTravelPlan();
	const isSaving = createTravelPlan.isPending || updateTravelPlan.isPending;
	const isDeleting = deleteTravelPlan.isPending;

	const initialCenter: [number, number] | undefined = (() => {
		if (!plan?.geohash) return undefined;
		try {
			const decoded = decodeGeohash(plan.geohash);
			return [(decoded.lat[0] + decoded.lat[1]) / 2, (decoded.lon[0] + decoded.lon[1]) / 2];
		} catch {
			return undefined;
		}
	})();

	// Pre-fill the selected location from the existing plan's geohash, resolving a readable label.
	useEffect(() => {
		if (!plan?.geohash) return;
		let cancelled = false;
		try {
			const decoded = decodeGeohash(plan.geohash);
			const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
			const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
			setSelectedLocation({ lat, lon, label: t("travel_plans.resolving_location") });
			void reverseGeocodeGeohash(plan.geohash).then((label) => {
				if (!cancelled && label) {
					setSelectedLocation({ lat, lon, label });
				}
			});
		} catch {
			// ignore invalid stored geohash
		}
		return () => {
			cancelled = true;
		};
	}, [plan?.geohash, t]);

	const handleClose = () => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);
		setTimeout(() => onClose(), 280);
	};

	const handleMapPick = (lat: number, lon: number) => {
		const fallbackLabel = t("travel_plans.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) });
		setSelectedLocation({ lat, lon, label: t("travel_plans.resolving_location") });
		void reverseGeocodeGeohash(encodeGeohash(lat, lon)).then((label) => {
			setSelectedLocation((current) =>
				current && current.lat === lat && current.lon === lon
					? { ...current, label: label ?? fallbackLabel }
					: current,
			);
		});
	};

	const performSearch = async (query: string, signal?: AbortSignal) => {
		if (!query || query === lastSearchedQuery) {
			setIsSearchingLocation(false);
			return;
		}
		setLastSearchedQuery(query);
		setIsSearchingLocation(true);
		try {
			const res = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`,
				{ signal, headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
			);
			if (!res.ok) throw new Error("search failed");
			setLocationResults(z.array(geocodeResultSchema).parse(await res.json()));
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") return;
		} finally {
			setIsSearchingLocation(false);
		}
	};

	useEffect(() => {
		const query = locationQuery.trim();
		if (query.length < 2) {
			setLocationResults([]);
			setIsSearchingLocation(false);
			setLastSearchedQuery("");
			return;
		}
		const ctrl = new AbortController();
		const timer = setTimeout(() => void performSearch(query, ctrl.signal), 500);
		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	}, [locationQuery]);

	const clearSearch = () => {
		setLocationQuery("");
		setLocationResults([]);
		setLastSearchedQuery("");
	};

	const isSearching = locationQuery.trim().length > 0;

	const handleSave = async () => {
		if (!selectedLocation) {
			toast.error(t("travel_plans.error_no_location"));
			return;
		}
		const startMs = parseDateInput(startDate);
		const endMs = parseDateInput(endDate);
		if (!startMs || !endMs) {
			toast.error(t("travel_plans.error_no_dates"));
			return;
		}
		if (endMs < startMs) {
			toast.error(t("travel_plans.error_end_before_start"));
			return;
		}

		const geohash = encodeGeohash(selectedLocation.lat, selectedLocation.lon);
		const trimmedNotes = notes.trim() || null;

		try {
			if (isEditing && plan) {
				await updateTravelPlan.mutateAsync({
					travelPlanId: plan.travelPlanId,
					profileId,
					geohash,
					startDate: startMs,
					endDate: endMs,
					showOnProfile,
					notes: trimmedNotes,
				});
				toast.success(t("travel_plans.toast_updated"));
			} else {
				await createTravelPlan.mutateAsync({
					profileId,
					geohash,
					startDate: startMs,
					endDate: endMs,
					showOnProfile,
					notes: trimmedNotes,
				});
				toast.success(t("travel_plans.toast_created"));
			}
			handleClose();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("travel_plans.error_save_failed"));
		}
	};

	const handleDelete = async () => {
		if (!plan) return;
		try {
			await deleteTravelPlan.mutateAsync({ travelPlanId: plan.travelPlanId, profileId });
			toast.success(t("travel_plans.toast_deleted"));
			handleClose();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("travel_plans.error_delete_failed"));
		} finally {
			setShowDeleteConfirm(false);
		}
	};

	return (
		<div className={`fixed inset-0 z-[55] flex flex-col no-touch-callout isolate ${isClosing ? "pointer-events-none" : ""}`}>
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${isClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
				onClick={handleClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${isClosing ? "animate-modal-top-out" : "animate-modal-top-in"} md:border-x md:border-[var(--border)]`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative shrink-0 overflow-hidden border-b border-[var(--border)] px-[var(--app-px)] pb-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<PageHeaderBackground color="var(--accent)" />
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)]">
								<Plane className="h-5 w-5" />
							</div>
							<h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
								{isEditing ? t("travel_plans.edit_title") : t("travel_plans.add_title")}
							</h2>
						</div>
						<button
							type="button"
							onClick={handleClose}
							className="shrink-0 rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
							aria-label="Close"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</header>

				{/* Scrollable content */}
				<div className="relative z-10 flex-1 overflow-y-auto px-[var(--app-px)]">
					<div className="space-y-4 py-4">
						{/* Destination: search + results + selected pick + map picker, all in one combined card */}
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("travel_plans.destination")}
							</p>
							<div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] transition focus-within:border-[var(--accent)]">
								<div className="relative">
									<Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
									<input
										type="text"
										value={locationQuery}
										onChange={(e) => setLocationQuery(e.target.value)}
										placeholder={t("travel_plans.search_placeholder")}
										className="h-12 w-full bg-transparent pl-10 pr-10 text-sm text-[var(--text)] outline-none"
									/>
									{isSearchingLocation ? (
										<Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
									) : locationQuery ? (
										<button
											type="button"
											onClick={clearSearch}
											className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-muted)] transition hover:text-[var(--text)]"
										>
											<X className="h-3.5 w-3.5" />
										</button>
									) : null}
								</div>

								{isSearching ? (
									locationResults.length > 0 ? (
										<div className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
											{locationResults.map((result) => (
												<button
													key={`${result.lat}:${result.lon}`}
													type="button"
													onClick={() => {
														setSelectedLocation({
															lat: Number(result.lat),
															lon: Number(result.lon),
															label: result.display_name,
														});
														setLocationQuery("");
														setLocationResults([]);
													}}
													className="flex w-full items-center gap-3 bg-[var(--surface-2)] px-4 py-3 text-left transition hover:bg-[var(--surface-3,var(--surface))] active:bg-[var(--surface)]"
												>
													<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--text-muted)]">
														<MapPin className="h-3.5 w-3.5" />
													</div>
													<span className="text-sm text-[var(--text)] line-clamp-2">{result.display_name}</span>
												</button>
											))}
										</div>
									) : !isSearchingLocation ? (
										<p className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
											{t("travel_plans.search_no_results")}
										</p>
									) : null
								) : (
									<>
										{selectedLocation && (
											<div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--accent)]/8 px-4 py-3">
												<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
													<MapPin className="h-4 w-4" />
												</div>
												<p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
													{selectedLocation.label}
												</p>
												<Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />
											</div>
										)}

										<button
											type="button"
											onClick={() => {
												setMapPickerError(null);
												setIsMapOpen((v) => !v);
											}}
											className="flex w-full items-center gap-3 border-t border-[var(--border)] px-4 py-3 text-left text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--surface-3,var(--surface))]"
										>
											<Map className="h-4 w-4 shrink-0" />
											<span className="flex-1">{t("travel_plans.map_picker_title")}</span>
											<ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isMapOpen ? "rotate-180" : ""}`} />
										</button>
										{isMapOpen && (
											<div className="border-t border-[var(--border)]">
												{mapPickerError ? (
													<p className="px-4 py-3 text-sm text-[var(--text-muted)]">{mapPickerError}</p>
												) : (
													<MapLocationPicker
														selectedLocation={selectedLocation}
														onPick={handleMapPick}
														onError={setMapPickerError}
														defaultZoom={11}
														initialCenter={initialCenter}
													/>
												)}
											</div>
										)}
									</>
								)}
							</div>
						</div>

						{/* Dates */}
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("travel_plans.dates")}
							</p>
							<div className="grid grid-cols-2 gap-3">
								<input
									type="date"
									value={startDate}
									onChange={(e) => setStartDate(e.target.value)}
									className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]"
								/>
								<input
									type="date"
									value={endDate}
									onChange={(e) => setEndDate(e.target.value)}
									className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]"
								/>
							</div>
						</div>

						{/* Notes */}
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("travel_plans.notes")}
							</p>
							<textarea
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder={t("travel_plans.notes_placeholder")}
								rows={3}
								className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]"
							/>
						</div>

						{/* Show on profile */}
						<div className="surface-card overflow-hidden">
							<ToggleRow
								label={t("travel_plans.show_on_profile")}
								description={t("travel_plans.show_on_profile_desc")}
								checked={showOnProfile}
								onChange={setShowOnProfile}
							/>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div
					className="relative z-10 flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-[var(--app-px)] pt-3"
					style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
				>
					{isEditing && (
						<button
							type="button"
							onClick={() => setShowDeleteConfirm(true)}
							disabled={isDeleting}
							aria-label={t("travel_plans.delete")}
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/8 text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
						>
							{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
						</button>
					)}
					<button
						type="button"
						onClick={() => void handleSave()}
						disabled={isSaving}
						className="relative flex h-12 flex-1 items-center justify-center overflow-hidden rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-contrast)] transition disabled:opacity-60"
					>
						{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("travel_plans.save")}
					</button>
				</div>
			</div>

			<ConfirmDialog
				isOpen={showDeleteConfirm}
				title={t("travel_plans.delete_confirm_title")}
				message={t("travel_plans.delete_confirm_message")}
				confirmLabel={t("travel_plans.delete")}
				cancelLabel={t("common.cancel")}
				confirmTone="danger"
				isProcessing={isDeleting}
				onConfirm={() => void handleDelete()}
				onCancel={() => setShowDeleteConfirm(false)}
			/>
		</div>
	);
}
