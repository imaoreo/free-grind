import { useEffect, useMemo, useState } from "react";
import { Flame, Languages, LayoutGrid, Monitor, Moon, Ruler, Sparkles, Star, Sun } from "lucide-react";
import toast from "react-hot-toast";
import { usePreferences, ACCENT_PRESETS, type ColorScheme } from "../../contexts/PreferencesContext";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import {
	SUPPORTED_LOCALE_OPTIONS,
	resolveSupportedLocale,
} from "../../utils/locales";
import { type UnitsPreset } from "../../utils/units";

function normalizeHex(value: string): string {
	const cleaned = value.trim().replace(/^#/, "");
	if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
		return `#${cleaned
			.split("")
			.map((char) => char + char)
			.join("")
			.toLowerCase()}`;
	}
	if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
		return `#${cleaned.toLowerCase()}`;
	}
	return "";
}

function getContrastForHex(hexColor: string): "#1a1a1a" | "#ffffff" {
	const normalized = normalizeHex(hexColor);
	if (!normalized) {
		return "#1a1a1a";
	}

	const r = parseInt(normalized.slice(1, 3), 16);
	const g = parseInt(normalized.slice(3, 5), 16);
	const b = parseInt(normalized.slice(5, 7), 16);

	const toLinear = (channel: number) => {
		const normalizedChannel = channel / 255;
		if (normalizedChannel <= 0.03928) {
			return normalizedChannel / 12.92;
		}
		return ((normalizedChannel + 0.055) / 1.055) ** 2.4;
	};

	const luminance =
		0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
	const contrastWithDark = (luminance + 0.05) / 0.05;
	const contrastWithLight = 1.05 / (luminance + 0.05);

	return contrastWithDark >= contrastWithLight ? "#1a1a1a" : "#ffffff";
}


function SelectRow({
	icon,
	iconClass,
	label,
	value,
	onChange,
	options,
}: {
	icon: React.ReactNode;
	iconClass: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<div className="flex items-center gap-3 px-4 py-3.5">
			<div className={`rounded-2xl p-2.5 shrink-0 ${iconClass}`}>{icon}</div>
			<p className="min-w-0 flex-1 text-sm font-semibold">{label}</p>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-9 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 pr-7 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</div>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
			{children}
		</p>
	);
}

export function CustomizabilityPage() {
	const { i18n, t } = useTranslation();
	const {
		colorScheme,
		accentColor,
		mobileGridColumns,
		unitsPreset,
		revealEffectEnabled,
		revealEffectStrength,
		setPreferences,
	} = usePreferences();
	const [customHex, setCustomHex] = useState(accentColor);
	const [hexError, setHexError] = useState<string | null>(null);
	const [showRightNow, setShowRightNow] = useState(() => window.localStorage.getItem("fg-show-right-now") !== "false");
	const [showInterest, setShowInterest] = useState(() => window.localStorage.getItem("fg-show-interest") !== "false");
	const [defaultInterestTab, setDefaultInterestTab] = useState(() => window.localStorage.getItem("fg-interest-default-tab") || "taps");
	const schemeOptions: {
		value: ColorScheme;
		label: string;
		icon: React.ReactNode;
	}[] = useMemo(
		() => [
			{
				value: "system",
				label: t("customizability.schemes.system"),
				icon: <Monitor className="h-5 w-5" />,
			},
			{
				value: "light",
				label: t("customizability.schemes.light"),
				icon: <Sun className="h-5 w-5" />,
			},
			{
				value: "dark",
				label: t("customizability.schemes.dark"),
				icon: <Moon className="h-5 w-5" />,
			},
		],
		[t],
	);
	const selectedLocale = resolveSupportedLocale(i18n.language);

	useEffect(() => {
		setCustomHex(accentColor);
	}, [accentColor]);

	const handleSchemeChange = (scheme: ColorScheme) => {
		void setPreferences({ colorScheme: scheme });
	};

	const handleAccentChange = (preset: (typeof ACCENT_PRESETS)[number]) => {
		void setPreferences({ accentColor: preset.color, accentContrast: preset.contrast });
	};

	const handleApplyCustomHex = () => {
		const normalized = normalizeHex(customHex);
		if (!normalized) {
			setHexError(t("customizability.hex_error"));
			return;
		}

		setHexError(null);
		void setPreferences({
			accentColor: normalized,
			accentContrast: getContrastForHex(normalized),
		});
	};

	const handlePickColor = (value: string) => {
		const normalized = normalizeHex(value);
		if (!normalized) {
			return;
		}

		setCustomHex(normalized);
		setHexError(null);
		void setPreferences({
			accentColor: normalized,
			accentContrast: getContrastForHex(normalized),
		});
	};

	const handleLocaleChange = async (locale: string) => {
		try {
			const nextLocale = resolveSupportedLocale(locale);
			await i18n.changeLanguage(nextLocale);
			document.documentElement.lang = nextLocale;
		} catch (error) {
			const message =
				error instanceof Error && error.message
					? error.message
					: "Failed to change language.";
			toast.error(message);
		}
	};

	const handleUnitsPresetChange = (preset: UnitsPreset) => {
		void setPreferences({ unitsPreset: preset });
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.customizability")}</h1>
				<p className="app-subtitle">{t("customizability.subtitle")}</p>
			</header>

			<div className="grid gap-6">

				{/* APPEARANCE */}
				<div>
					<SectionLabel>{t("customizability.appearance")}</SectionLabel>
					<div className="grid gap-3">

						{/* Color Scheme */}
						<div className="surface-card p-4">
							<p className="mb-3 text-sm font-semibold">{t("customizability.color_scheme")}</p>
							<div className="grid grid-cols-3 gap-2">
								{schemeOptions.map(({ value, label, icon }) => {
									const isActive = colorScheme === value;
									return (
										<button
											key={value}
											type="button"
											onClick={() => handleSchemeChange(value)}
											className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all"
											style={{
												borderColor: isActive ? "var(--accent)" : "var(--border)",
												background: isActive
													? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
													: "var(--surface-2)",
												color: isActive ? "var(--accent-readable)" : "var(--text)",
											}}
										>
											{icon}
											<span className="text-xs font-medium">{label}</span>
										</button>
									);
								})}
							</div>
						</div>

						{/* Accent Color + Preview combined */}
						<div className="surface-card overflow-hidden">
						<div className="p-4">
							<p className="mb-3 text-sm font-semibold">{t("customizability.accent_color")}</p>

							{/* Preset swatches + custom swatch in one row */}
							<div className="flex flex-wrap gap-3 p-1">
								{ACCENT_PRESETS.map((preset) => {
									const isActive = accentColor === preset.color;
									return (
										<button
											key={preset.color}
											type="button"
											onClick={() => handleAccentChange(preset)}
											title={preset.name}
											className="relative h-8 w-8 rounded-full transition-transform hover:scale-110 sm:h-10 sm:w-10"
											style={{
												background: preset.color,
												outline: isActive ? `2.5px solid ${preset.color}` : "none",
												outlineOffset: "3px",
											}}
										>
											{isActive && (
												<span
													className="absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold sm:text-sm"
													style={{ color: preset.contrast }}
												>
													✓
												</span>
											)}
										</button>
									);
								})}

								{/* Custom color — same swatch style, opens native picker */}
								{(() => {
									const isCustom = !ACCENT_PRESETS.some((p) => p.color === accentColor);
									return (
										<label
											htmlFor="accent-color-picker"
											className="relative h-8 w-8 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-110 sm:h-10 sm:w-10"
											style={{
												background: isCustom ? accentColor : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
												outline: isCustom ? `2.5px solid ${accentColor}` : "none",
												outlineOffset: "3px",
											}}
											title={t("customizability.picker")}
										>
											<input
												id="accent-color-picker"
												type="color"
												value={normalizeHex(customHex) || "#ffcc01"}
												onChange={(event) => handlePickColor(event.target.value)}
												className="sr-only"
											/>
											{isCustom && (
												<span
													className="absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold sm:text-sm"
													style={{ color: getContrastForHex(accentColor) }}
												>
													✓
												</span>
											)}
										</label>
									);
								})()}
							</div>

							{/* Hex input — applies on blur or Enter, no button needed */}
							<div className="mt-4">
								<div
									className={`flex h-10 items-center overflow-hidden rounded-lg border bg-[var(--surface-2)] px-3 transition-colors focus-within:border-[var(--accent)] ${
										hexError ? "border-red-400" : "border-[var(--border)]"
									}`}
								>
									<span
										className="mr-2.5 h-4 w-4 shrink-0 rounded-full border border-white/20"
										style={{ background: normalizeHex(customHex) || accentColor }}
									/>
									<input
										type="text"
										value={customHex}
										onChange={(e) => {
											setCustomHex(e.target.value);
											if (hexError) setHexError(null);
										}}
										onBlur={handleApplyCustomHex}
										onKeyDown={(e) => { if (e.key === "Enter") handleApplyCustomHex(); }}
										placeholder="#22c55e"
										className="h-full flex-1 bg-transparent font-mono text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
									/>
									<span className="ml-2 text-xs text-[var(--text-muted)]">
										{ACCENT_PRESETS.find((p) => p.color === accentColor)?.name ?? t("customizability.custom")}
									</span>
								</div>
								{hexError && <p className="mt-1.5 text-xs text-red-400">{hexError}</p>}
							</div>
						</div>
						{/* Preview — inline below hex input */}
						<div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 flex flex-col gap-3">
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold"
									style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
								>
									{t("customizability.preview_primary")}
								</button>
								<button
									type="button"
									className="inline-flex h-9 items-center rounded-lg border px-4 text-sm font-semibold"
									style={{ borderColor: "var(--accent)", color: "var(--accent-readable)" }}
								>
									{t("customizability.preview_outlined")}
								</button>
								<button
									type="button"
									className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold"
									style={{
										background: "color-mix(in srgb, var(--accent) 15%, transparent)",
										color: "var(--accent-readable)",
									}}
								>
									{t("customizability.preview_subtle")}
								</button>
							</div>
							<div className="flex items-center gap-2">
								<div
									className="flex h-9 flex-1 items-center rounded-lg border px-3 text-sm text-[var(--text-muted)]"
									style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 6%, var(--surface))" }}
								>
									<span className="mr-2 h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
									{t("customizability.preview_input")}
								</div>
								<span
									className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold"
									style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
								>
									{t("customizability.preview_badge")}
								</span>
							</div>
						</div>
						</div>

					</div>
				</div>

				{/* LAYOUT */}
				<div>
					<SectionLabel>{t("customizability.layout")}</SectionLabel>
					<div className="grid gap-3">

						{/* Browse Grid + Reveal Effect combined */}
						<div className="surface-card overflow-hidden">

							{/* Browse Grid */}
							<div className="p-4">
								<div className="flex items-start gap-3">
									<div className="rounded-2xl bg-blue-500/15 p-2.5 text-blue-400 shrink-0">
										<LayoutGrid className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">{t("customizability.browse_grid_mobile")}</p>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											{t("customizability.browse_grid_mobile_desc")}
										</p>
										<div className="mt-3 grid grid-cols-2 gap-2">
											{(["2", "3"] as const).map((cols) => (
												<button
													key={cols}
													type="button"
													onClick={() => void setPreferences({ mobileGridColumns: cols })}
													className="rounded-xl border-2 p-3 text-sm font-semibold transition-all"
													style={{
														borderColor: mobileGridColumns === cols ? "var(--accent)" : "var(--border)",
														background: mobileGridColumns === cols
															? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
															: "var(--surface-2)",
														color: mobileGridColumns === cols ? "var(--accent-readable)" : "var(--text)",
													}}
												>
													{t(`customizability.columns_${cols}`)}
												</button>
											))}
										</div>
									</div>
									{/* spacer matching toggle width so buttons align with reveal effect */}
									<div className="w-12 shrink-0" />
								</div>
							</div>

							{/* Reveal Effect */}
							<div className="border-t border-[var(--border)]">
								<ToggleRow
									icon={<Sparkles className="h-5 w-5" />}
									iconClass="bg-violet-500/15 text-violet-400"
									label={t("customizability.reveal_effect.enable")}
									description={t("customizability.reveal_effect.enable_desc")}
									checked={revealEffectEnabled}
									onChange={(checked) => void setPreferences({ revealEffectEnabled: checked })}
								/>
								{revealEffectEnabled && (
									<div className="grid grid-cols-2 gap-2 pb-4 pl-[68px] pr-[76px]">
										{(["subtle", "pronounced"] as const).map((s) => (
											<button
												key={s}
												type="button"
												onClick={() => void setPreferences({ revealEffectStrength: s })}
												className="rounded-xl border-2 p-3 text-sm font-semibold transition-all"
												style={{
													borderColor: revealEffectStrength === s ? "var(--accent)" : "var(--border)",
													background: revealEffectStrength === s
														? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
														: "var(--surface-2)",
													color: revealEffectStrength === s ? "var(--accent-readable)" : "var(--text)",
												}}
											>
												{t(`customizability.reveal_effect.strengths.${s}`)}
											</button>
										))}
									</div>
								)}
							</div>

						</div>

					</div>
				</div>

				{/* NAVIGATION */}
				<div>
					<SectionLabel>{t("customizability.navigation_tabs")}</SectionLabel>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<Flame className="h-5 w-5" />}
							iconClass="bg-orange-500/15 text-orange-400"
							label={t("customizability.show_right_now")}
							description={t("customizability.show_right_now_desc")}
							checked={showRightNow}
							onChange={(checked) => {
								setShowRightNow(checked);
								window.localStorage.setItem("fg-show-right-now", String(checked));
								window.location.reload();
							}}
						/>
						<ToggleRow
							icon={<Star className="h-5 w-5" />}
							iconClass="bg-yellow-500/15 text-yellow-400"
							label={t("customizability.show_interest")}
							description={t("customizability.show_interest_desc")}
							checked={showInterest}
							onChange={(checked) => {
								setShowInterest(checked);
								window.localStorage.setItem("fg-show-interest", String(checked));
								window.location.reload();
							}}
						/>
						{showInterest && (
							<SelectRow
								icon={<Star className="h-5 w-5 opacity-50" />}
								iconClass="bg-yellow-500/10 text-yellow-400"
								label={t("customizability.default_interest_view")}
								value={defaultInterestTab}
								onChange={(val) => {
									setDefaultInterestTab(val);
									window.localStorage.setItem("fg-interest-default-tab", val);
								}}
								options={[
									{ value: "taps", label: t("customizability.interest_show_taps") },
									{ value: "views", label: t("customizability.interest_show_views") },
								]}
							/>
						)}
					</div>
				</div>

				{/* REGIONAL */}
				<div>
					<SectionLabel>{t("customizability.regional")}</SectionLabel>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<SelectRow
							icon={<Languages className="h-5 w-5" />}
							iconClass="bg-teal-500/15 text-teal-400"
							label={t("settings.language")}
							value={selectedLocale}
							onChange={(val) => void handleLocaleChange(val)}
							options={SUPPORTED_LOCALE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
						/>
						<SelectRow
							icon={<Ruler className="h-5 w-5" />}
							iconClass="bg-cyan-500/15 text-cyan-400"
							label={t("customizability.units")}
							value={unitsPreset}
							onChange={(val) => handleUnitsPresetChange(val as UnitsPreset)}
							options={[
								{ value: "world", label: t("customizability.units_world") },
								{ value: "uk", label: t("customizability.units_uk") },
								{ value: "american", label: t("customizability.units_american") },
							]}
						/>
					</div>
				</div>

			</div>
		</section>
	);
}
