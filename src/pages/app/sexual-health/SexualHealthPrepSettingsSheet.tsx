import { CalendarClock, Check, Info, Repeat, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { useDesktopBreakpoint } from "../../../hooks/useDesktopBreakpoint";
import type { PrepScheme } from "../../../services/prepTracking";

const SCHEME_OPTIONS: {
	value: PrepScheme;
	icon: typeof Repeat;
	labelKey: string;
	labelDefault: string;
	taglineKey: string;
	taglineDefault: string;
	descKey: string;
	descDefault: string;
}[] = [
	{
		value: "daily",
		icon: Repeat,
		labelKey: "sexualHealth.info.scheme_daily_label",
		labelDefault: "Daily",
		taglineKey: "sexualHealth.info.scheme_daily_tagline",
		taglineDefault: "One pill, every day",
		descKey: "sexualHealth.info.daily_desc",
		descDefault:
			"One pill every day at roughly the same time. Protection builds up over your first doses and is maintained by staying consistent.",
	},
	{
		value: "on_demand",
		icon: CalendarClock,
		labelKey: "sexualHealth.info.scheme_on_demand_label",
		labelDefault: "On-demand (2-1-1)",
		taglineKey: "sexualHealth.info.scheme_on_demand_tagline",
		taglineDefault: "2 pills before, 2 after",
		descKey: "sexualHealth.info.on_demand_desc",
		descDefault:
			"2 pills 2-24h before sex, then 1 pill 24h after the first dose, then 1 pill 48h after the first dose. Log each step as you take it and the PrEP tab will track your coverage.",
	},
];

// Portalled to document.body — see EncounterLogSheet.tsx for why (avoids
// the FeedScrollContainer mask-image containing-block issue).
export function SexualHealthPrepSettingsSheet({
	scheme,
	onSchemeChange,
	onClose,
}: {
	scheme: PrepScheme;
	onSchemeChange: (scheme: PrepScheme) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const active = SCHEME_OPTIONS.find((option) => option.value === scheme) ?? SCHEME_OPTIONS[0];

	return createPortal(
		<BottomSheet onClose={onClose} isDesktop={isDesktop}>
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">
					{t("sexualHealth.info.sheet_title", { defaultValue: "PrEP settings" })}
				</p>
				<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>

			<div className="grid max-h-[75dvh] gap-4 overflow-y-auto px-4 pb-4" data-lenis-prevent>
				<div className="grid grid-cols-2 gap-3">
					{SCHEME_OPTIONS.map((option) => {
						const isSelected = scheme === option.value;
						const Icon = option.icon;
						return (
							<button
								key={option.value}
								type="button"
								onClick={() => onSchemeChange(option.value)}
								className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition-colors ${
									isSelected
										? "border-[var(--accent)] bg-[var(--accent)]/10"
										: "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--text-muted)]"
								}`}
							>
								{isSelected && (
									<span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
										<Check className="h-3 w-3" />
									</span>
								)}
								<div className="rounded-xl bg-[var(--accent)] p-2 text-[var(--accent-contrast)]">
									<Icon className="h-4 w-4" />
								</div>
								<div>
									<p className="text-sm font-semibold">{t(option.labelKey, { defaultValue: option.labelDefault })}</p>
									<p className="mt-0.5 text-xs text-[var(--text-muted)]">
										{t(option.taglineKey, { defaultValue: option.taglineDefault })}
									</p>
								</div>
							</button>
						);
					})}
				</div>

				<div className="flex gap-2.5 rounded-2xl bg-[var(--surface-2)] p-3.5">
					<active.icon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
					<p className="text-xs leading-relaxed text-[var(--text-muted)]">
						{t(active.descKey, { defaultValue: active.descDefault })}
					</p>
				</div>

				<div className="flex gap-2.5">
					<Info className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-60" />
					<p className="text-xs leading-relaxed text-[var(--text-muted)] opacity-80">
						{t("sexualHealth.info.footer", {
							defaultValue:
								"This is a personal tracking tool. It doesn't replace medical advice — talk to a healthcare provider about what's right for you.",
						})}
					</p>
				</div>
			</div>
		</BottomSheet>,
		document.body,
	);
}
