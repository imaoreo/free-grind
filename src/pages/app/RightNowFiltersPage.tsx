import { SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RangeSlider } from "../../components/ui/range-slider";
import { cn } from "../../utils/cn";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import type { RightNowFiltersDraft } from "./rightnow/rightnow-filters-storage";
import { getSexualPositionFilterOptions } from "./profile-option-builders";

interface RightNowFiltersPageProps {
	onClose: () => void;
	onApply: (draft: RightNowFiltersDraft) => void;
	initialDraft: RightNowFiltersDraft;
}

export function RightNowFiltersPage({ onClose, onApply, initialDraft }: RightNowFiltersPageProps) {
	const { t } = useTranslation();
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [ageMin, setAgeMin] = useState(initialDraft.ageMin);
	const [ageMax, setAgeMax] = useState(initialDraft.ageMax);
	const [positionFilter, setPositionFilter] = useState(initialDraft.positionFilter);

	const positionFilterOptions = useMemo(
		() => getSexualPositionFilterOptions(t, t("right_now.any_position")),
		[t],
	);

	const handleClose = useCallback(() => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);

		if (window.history.state?.modal === "right-now-filters") {
			window.history.back();
		}

		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
		}
		closeTimeoutRef.current = setTimeout(() => {
			closeTimeoutRef.current = null;
			onClose();
		}, 300);
	}, [onClose]);

	useEffect(() => {
		return () => {
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current);
				closeTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (window.history.state?.modal !== "right-now-filters") {
			window.history.pushState({ modal: "right-now-filters" }, "");
		}

		const handlePopState = (e: PopStateEvent) => {
			if (e.state?.modal !== "right-now-filters") {
				handleClose();
			}
		};

		window.addEventListener("popstate", handlePopState);
		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [handleClose]);

	const applyAndReturn = () => {
		onApply({ ageMin, ageMax, positionFilter });
		handleClose();
	};

	const clearAndReturn = () => {
		onApply({ ageMin: 18, ageMax: 99, positionFilter: "" });
		handleClose();
	};

	return (
		<div
			className={`fixed inset-0 z-[55] flex flex-col no-touch-callout isolate ${
				isClosing ? "pointer-events-none" : ""
			}`}
		>
			{/* Backdrop */}
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${
					isClosing ? "animate-backdrop-out" : "animate-backdrop-in"
				}`}
				onClick={handleClose}
			/>

			{/* Modal */}
			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-top-out" : "animate-modal-top-in"
				} md:border-x md:border-[var(--border)]`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative shrink-0 overflow-hidden px-[var(--app-px)] pb-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<PageHeaderBackground color="var(--right-now)" />
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)]">
								<SlidersHorizontal className="h-5 w-5" />
							</div>
							<h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
								{t("right_now_filters.title")}
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

				<div className="shrink-0 border-b border-[var(--border)]" />

				{/* Scroll content */}
				<div className="relative z-10 flex-1 overflow-y-auto px-[var(--app-px)]">
					<div className="space-y-3 py-4">
						{/* Position Filter Section */}
						<section
							className="rounded-2xl p-4"
							style={{
								backgroundColor: "color-mix(in srgb, var(--right-now), transparent 96%)",
								border: "1px solid color-mix(in srgb, var(--right-now), transparent 88%)",
							}}
						>
							<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
								{t("right_now_filters.position")}
							</p>
							<div className="flex flex-wrap gap-2">
								{positionFilterOptions.map((option) => {
									const isActive = option.value === positionFilter;
									return (
										<button
											key={option.value || "any"}
											type="button"
											onClick={() => setPositionFilter(option.value)}
											className={cn(
												"rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all active:scale-95",
												isActive
													? "border-[var(--right-now)] bg-[var(--right-now)] text-white shadow-sm"
													: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--right-now)]/60 hover:text-[var(--text)]",
											)}
										>
											{option.label}
										</button>
									);
								})}
							</div>
						</section>

						{/* Age Filter Section */}
						<section
							className="rounded-2xl p-4"
							style={{
								backgroundColor: "color-mix(in srgb, var(--right-now), transparent 96%)",
								border: "1px solid color-mix(in srgb, var(--right-now), transparent 88%)",
							}}
						>
							<RangeSlider
								label={t("right_now_filters.age_range")}
								min={18}
								max={99}
								step={1}
								minDefault={ageMin}
								maxDefault={ageMax}
								activeColor="var(--right-now)"
								showSeparator={true}
								onChange={(min, max) => {
									setAgeMin(min);
									setAgeMax(max);
								}}
							/>
						</section>
					</div>
				</div>

				{/* Bottom actions */}
				<div
					className="relative z-10 shrink-0 border-t border-[var(--border)] px-[var(--app-px)] pt-3 flex gap-2"
					style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
				>
					<button
						type="button"
						onClick={clearAndReturn}
						className="flex-1 rounded-2xl border border-[var(--border)] py-3 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--right-now)] hover:text-[var(--text)]"
					>
						{t("browse_filters.clear_all")}
					</button>
					<button
						type="button"
						onClick={applyAndReturn}
						className="group relative h-12 flex-1 overflow-hidden rounded-2xl bg-[var(--right-now)] text-sm font-bold text-white transition hover:brightness-110 active:scale-[0.98]"
						style={{ boxShadow: "0 8px 20px -4px color-mix(in srgb, var(--right-now), transparent 65%)" }}
					>
						<span className="relative z-10">{t("right_now_filters.apply")}</span>
						<div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
					</button>
				</div>
			</div>
		</div>
	);
}
