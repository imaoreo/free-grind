import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RangeSlider } from "../../components/ui/range-slider";
import { cn } from "../../utils/cn";
import {
	loadRightNowFiltersDraft,
	type RightNowFiltersDraft,
} from "./rightnow/rightnow-filters-storage";
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

		setTimeout(() => {
			onClose();
		}, 300);
	}, [onClose]);

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
		onApply({
			ageMin,
			ageMax,
			positionFilter,
		});
		handleClose();
	};

	return (
		<div className="fixed inset-0 z-40 flex flex-col no-touch-callout isolate">
			{/* Backdrop */}
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${
					isClosing ? "animate-backdrop-out" : "animate-backdrop-in"
				}`}
				onClick={handleClose}
			/>

			{/* Modal Content */}
			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-top-out" : "animate-modal-top-in"
				} md:border-x md:border-[var(--border)]`}
				style={{
					paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 90px)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative z-10 flex items-start justify-between px-[var(--app-px)] pb-2 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<h2 className="mt-8 text-xl font-bold tracking-tight text-[var(--text)]">
						{t("right_now_filters.title")}
					</h2>
					<button
						type="button"
						onClick={handleClose}
						className="rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
						aria-label="Close"
					>
						<X className="h-5 w-5" />
					</button>
				</header>

				<div className="relative z-10 flex-1 overflow-y-auto px-[var(--app-px)]">
					<div className="space-y-6 pt-2 pb-8">
						{/* Position Filter Section */}
						<section
							className="relative rounded-2xl p-5"
							style={{ backgroundColor: "color-mix(in srgb, var(--right-now), transparent 97%)" }}
						>
							<div
								className="mb-3 flex items-center justify-between border-b pb-2"
								style={{ borderColor: "color-mix(in srgb, var(--right-now), transparent 80%)" }}
							>
								<div className="flex items-center gap-2">
									<h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
										{t("right_now_filters.position")}
									</h3>
								</div>
							</div>
							<div className="flex flex-wrap gap-2.5">
								{positionFilterOptions.map((option) => {
									const isActive = option.value === positionFilter;
									return (
										<button
											key={option.value || "any"}
											type="button"
											onClick={() => setPositionFilter(option.value)}
											className={cn(
												"relative rounded-xl border px-5 py-2.5 text-sm font-bold transition-all duration-300 active:scale-95",
												isActive
													? "bg-[var(--right-now)] border-[var(--right-now)] text-white"
													: "border-[var(--right-now)]/40 text-[var(--right-now)] hover:bg-[var(--right-now)]/20 hover:border-[var(--right-now)]/60",
											)}
											style={!isActive ? { backgroundColor: "color-mix(in srgb, var(--right-now), transparent 88%)" } : undefined}
										>
											{option.label}
										</button>
									);
								})}
							</div>
						</section>

						{/* Age Filter Section */}
						<section
							className="relative rounded-2xl p-5"
							style={{ backgroundColor: "color-mix(in srgb, var(--right-now), transparent 97%)" }}
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

						<div className="pt-0 pb-12">
							<button
								type="button"
								onClick={applyAndReturn}
								className="group relative overflow-hidden w-full rounded-2xl bg-[var(--right-now)] py-4 text-center font-bold text-white shadow-lg active:scale-[0.98] transition-all hover:brightness-110 flex items-center justify-center gap-2"
								style={{ boxShadow: "0 10px 15px -3px color-mix(in srgb, var(--right-now), transparent 80%)" }}
							>
								<span className="relative z-10">{t("right_now_filters.apply")}</span>
								<div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
