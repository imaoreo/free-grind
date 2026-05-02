import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { usePreferences, ACCENT_PRESETS, type ColorScheme } from "../../contexts/PreferencesContext";
import { BackToSettings } from "../../components/BackToSettings";
import {
	readAnalyticsConsentChoice,
	writeAnalyticsConsentChoice,
	type AnalyticsConsentChoice,
} from "../../utils/analyticsConsent";
import { useTranslation } from "react-i18next";
import {
	SUPPORTED_LOCALE_OPTIONS,
	resolveSupportedLocale,
} from "../../utils/locales";

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

export function CustomizabilityPage() {
	const { i18n, t } = useTranslation();
	const { colorScheme, accentColor, mobileGridColumns, setPreferences } = usePreferences();
	const [customHex, setCustomHex] = useState(accentColor);
	const [hexError, setHexError] = useState<string | null>(null);
	const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsentChoice | null>(
		() => readAnalyticsConsentChoice(),
	);
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
			console.error("Locale change failed:", error);
		}
	};

	return (
		<section className="app-screen">
			<header className="mb-6">
				<BackToSettings />
				<h1 className="app-title mb-2">{t("settings.customizability")}</h1>
				<p className="app-subtitle">{t("customizability.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				<div className="surface-card p-4 sm:p-5">
					<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings.language")}
					</p>
					<p className="mb-3 text-sm text-[var(--text-muted)]">
						{t("settings.language_description")}
					</p>
					<select
						value={selectedLocale}
						onChange={(event) => void handleLocaleChange(event.target.value)}
						className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
					>
						{SUPPORTED_LOCALE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>

				{/* Analytics & FreeGrind Discovery */}
				<div className="surface-card p-4 sm:p-5">
					<p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.analytics.title")}
					</p>
					<p className="text-sm text-[var(--text-muted)]">
						{t("customizability.analytics.description")}
					</p>
					<p className="mt-2 text-xs text-[var(--text-muted)]">
						{t("customizability.analytics.note")}
					</p>
					<div className="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => {
								writeAnalyticsConsentChoice("granted");
								setAnalyticsConsent("granted");
							}}
							className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition"
							style={{
								borderColor:
									analyticsConsent === "granted" ? "var(--accent)" : "var(--border)",
								background:
									analyticsConsent === "granted"
										? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
										: "var(--surface-2)",
								color:
									analyticsConsent === "granted"
										? "var(--accent-readable)"
										: "var(--text)",
							}}
						>
							{t("customizability.analytics.allow")}
						</button>
						<button
							type="button"
							onClick={() => {
								writeAnalyticsConsentChoice("denied");
								setAnalyticsConsent("denied");
							}}
							className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition"
							style={{
								borderColor:
									analyticsConsent === "denied" ? "var(--accent)" : "var(--border)",
								background:
									analyticsConsent === "denied"
										? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
										: "var(--surface-2)",
								color:
									analyticsConsent === "denied"
										? "var(--accent-readable)"
										: "var(--text)",
							}}
						>
							{t("customizability.analytics.deny")}
						</button>
					</div>
					<p className="mt-3 text-xs text-[var(--text-muted)]">
						{t("customizability.analytics.current")}: {" "}
						{analyticsConsent === null
							? t("customizability.analytics.not_selected")
							: analyticsConsent}
					</p>
				</div>

				{/* Color Scheme */}
				<div className="surface-card p-4 sm:p-5">
					<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.color_scheme")}
					</p>
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
											? "color-mix(in srgb, var(--accent) 12%, transparent)"
											: "var(--surface-2)",
										color: isActive
											? "var(--accent-readable)"
											: "var(--text-muted)",
									}}
								>
									{icon}
									<span className="text-xs font-medium">{label}</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* Accent Color */}
				<div className="surface-card p-4 sm:p-5">
					<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.accent_color")}
					</p>
					<div className="flex flex-wrap gap-3">
						{ACCENT_PRESETS.map((preset) => {
							const isActive = accentColor === preset.color;
							return (
								<button
									key={preset.color}
									type="button"
									onClick={() => handleAccentChange(preset)}
									title={preset.name}
									className="relative h-10 w-10 rounded-full transition-transform hover:scale-110"
									style={{ background: preset.color }}
								>
									{isActive && (
										<span
											className="absolute inset-0 flex items-center justify-center rounded-full text-sm font-bold"
											style={{ color: preset.contrast }}
										>
											✓
										</span>
									)}
									<span
										className="absolute -inset-0.5 rounded-full border-2"
										style={{
											borderColor: isActive ? preset.color : "transparent",
											boxShadow: isActive
												? `0 0 0 2px var(--surface), 0 0 0 4px ${preset.color}`
												: "none",
										}}
									/>
								</button>
							);
						})}
					</div>
					<p className="mt-3 text-xs text-[var(--text-muted)]">
						{t("customizability.selected")}: {" "}
						<span className="font-semibold" style={{ color: "var(--accent-readable)" }}>
							{ACCENT_PRESETS.find((p) => p.color === accentColor)?.name ??
								t("customizability.custom")}
						</span>
					</p>
					<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
						<div className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
							<label htmlFor="accent-color-picker" className="text-xs font-medium text-[var(--text-muted)]">
								{t("customizability.picker")}
							</label>
							<input
								id="accent-color-picker"
								type="color"
								value={normalizeHex(customHex) || "#ffcc01"}
								onChange={(event) => handlePickColor(event.target.value)}
								className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
							/>
						</div>
						<input
							type="text"
							value={customHex}
							onChange={(event) => {
								setCustomHex(event.target.value);
								if (hexError) {
									setHexError(null);
								}
							}}
							placeholder="#22c55e"
							className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] sm:max-w-xs"
						/>
						<button
							type="button"
							onClick={handleApplyCustomHex}
							className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
						>
							{t("customizability.apply_hex")}
						</button>
					</div>
					{hexError ? <p className="mt-2 text-xs text-red-400">{hexError}</p> : null}
				</div>

				{/* Browse Grid (Mobile) */}
				<div className="surface-card p-4 sm:p-5">
					<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.browse_grid_mobile")}
					</p>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={() => void setPreferences({ mobileGridColumns: "2" })}
							className="rounded-xl border-2 p-3 text-sm font-semibold transition-all"
							style={{
								borderColor:
									mobileGridColumns === "2" ? "var(--accent)" : "var(--border)",
								background:
									mobileGridColumns === "2"
										? "color-mix(in srgb, var(--accent) 12%, transparent)"
										: "var(--surface-2)",
								color:
									mobileGridColumns === "2"
										? "var(--accent-readable)"
										: "var(--text-muted)",
							}}
						>
							{t("customizability.columns_two")}
						</button>
						<button
							type="button"
							onClick={() => void setPreferences({ mobileGridColumns: "3" })}
							className="rounded-xl border-2 p-3 text-sm font-semibold transition-all"
							style={{
								borderColor:
									mobileGridColumns === "3" ? "var(--accent)" : "var(--border)",
								background:
									mobileGridColumns === "3"
										? "color-mix(in srgb, var(--accent) 12%, transparent)"
										: "var(--surface-2)",
								color:
									mobileGridColumns === "3"
										? "var(--accent-readable)"
										: "var(--text-muted)",
							}}
						>
							{t("customizability.columns_three")}
						</button>
					</div>
				</div>

				{/* Preview */}
				<div className="surface-card p-4 sm:p-5">
					<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("customizability.preview")}
					</p>
					<div className="flex flex-wrap gap-2">
						<span
							className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
							style={{
								background: "var(--accent)",
								color: "var(--accent-contrast)",
							}}
						>
							{t("customizability.preview_primary")}
						</span>
						<span
							className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold"
							style={{
								borderColor: "var(--accent)",
								color: "var(--accent-readable)",
							}}
						>
							{t("customizability.preview_outlined")}
						</span>
						<span
							className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
							style={{
								background: "color-mix(in srgb, var(--accent) 15%, transparent)",
								color: "var(--accent-readable)",
							}}
						>
							{t("customizability.preview_subtle")}
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}
