import { useEffect, useState } from "react";
import { Calendar, Check, ChevronLeft, Clock, FlaskConical, Pill, Settings, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { FilterPill } from "../../../components/ui/FilterPill";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import { FeedScrollContainer } from "../../../components/ui/FeedScrollContainer";
import { SexualHealthHistoryTab } from "./SexualHealthHistoryTab";
import { SexualHealthDosesTab } from "./SexualHealthDosesTab";
import { SexualHealthAppointmentsTab } from "./SexualHealthAppointmentsTab";
import { SexualHealthTestsTab } from "./SexualHealthTestsTab";
import { SexualHealthPrepSettingsSheet } from "./SexualHealthPrepSettingsSheet";
import { loadPrepDoses } from "../../../services/prepDoses";
import { computeProtectionStatus } from "../../../services/prepTracking";
import { usePrepScheme } from "./usePrepScheme";

type SexualHealthTab = "doses" | "history" | "appointments" | "tests";

export function SexualHealthPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	// Reached either from Settings → Safety or from the chat inbox header's
	// quick link — the back button should return wherever you actually came
	// from instead of always landing on Settings.
	const cameFromInbox = (location.state as { from?: string } | null)?.from === "inbox";
	const [activeTab, setActiveTab] = useState<SexualHealthTab>("history");
	// Each list tab portals its own action row (status card, filters) into
	// this slot so those controls stay pinned in the header instead of
	// scrolling away with the list underneath them.
	const [headerSlotEl, setHeaderSlotEl] = useState<HTMLDivElement | null>(null);
	// The floating "add/log" button also portals in, but into a slot
	// rendered as a sibling of (not nested inside) FeedScrollContainer —
	// see SexualHealthFab.tsx for why nesting it there breaks its
	// positioning, the same way RightNowPage keeps its own FAB outside its
	// FeedScrollContainer.
	const [fabSlotEl, setFabSlotEl] = useState<HTMLDivElement | null>(null);

	// Drives the small status badge on the "PrEP" tab pill — loaded here
	// (not just inside SexualHealthDosesTab) since the pill is visible from
	// every tab, not only while Doses is active.
	const [prepScheme, setPrepScheme] = usePrepScheme();
	const [prepBadge, setPrepBadge] = useState<"protected" | "attention" | null>(null);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	// Bumped by SexualHealthDosesTab right after a dose is logged/deleted so
	// the pill badge updates immediately instead of waiting for a tab switch
	// (which is the only other thing that re-triggers the effect below).
	const [prepRefreshKey, setPrepRefreshKey] = useState(0);

	useEffect(() => {
		let cancelled = false;
		void loadPrepDoses().then((doses) => {
			if (cancelled) return;
			const status = computeProtectionStatus(doses, prepScheme);
			if (status.state === "protected") {
				setPrepBadge("protected");
			} else if (status.state === "building" || status.state === "unprotected") {
				setPrepBadge("attention");
			} else {
				setPrepBadge(null);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [prepScheme, activeTab, prepRefreshKey]);

	const tabs: { value: SexualHealthTab; icon: React.ReactNode; label: string }[] = [
		{ value: "doses", icon: <Pill className="h-3.5 w-3.5" />, label: t("sexualHealth.tabs.doses", { defaultValue: "PrEP" }) },
		{ value: "history", icon: <Clock className="h-3.5 w-3.5" />, label: t("sexualHealth.tabs.history", { defaultValue: "History" }) },
		{
			value: "appointments",
			icon: <Calendar className="h-3.5 w-3.5" />,
			label: t("sexualHealth.tabs.appointments", { defaultValue: "Appointments" }),
		},
		{ value: "tests", icon: <FlaskConical className="h-3.5 w-3.5" />, label: t("sexualHealth.tabs.tests", { defaultValue: "Tests" }) },
	];

	return (
		<section className="app-screen flex h-dvh w-full flex-col overflow-x-hidden !px-0 !pb-0">
			<header className="relative z-20 flex shrink-0 flex-col pb-3 pointer-events-none">
				<PageHeaderBackground color="var(--accent)" />
				<div className="pointer-events-auto mx-auto grid w-full max-w-4xl gap-3 px-[var(--app-px)]">
					<button
						type="button"
						onClick={() => navigate(cameFromInbox ? "/chat" : "/settings")}
						className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
					>
						<ChevronLeft className="h-4 w-4" />
						{cameFromInbox ? t("nav.inbox") : t("settings.title")}
					</button>
					<div className="flex items-center justify-between gap-2">
						<h1 className="app-title">{t("sexualHealth.title", { defaultValue: "Sexual Health" })}</h1>
						<button
							type="button"
							onClick={() => setIsSettingsOpen(true)}
							className="shrink-0 rounded-xl p-2 text-[var(--text-muted)] transition hover:text-[var(--text)]"
							aria-label={t("sexualHealth.info.settings_button", { defaultValue: "PrEP settings" })}
						>
							<Settings className="h-5 w-5" />
						</button>
					</div>

					<div ref={setHeaderSlotEl} className="min-w-0 -mt-2.5 empty:hidden" />

					<div className="-mx-[var(--app-px)] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<div className="flex min-w-max items-center gap-2 px-[var(--app-px)]">
							{tabs.map((tab) => (
								<FilterPill
									key={tab.value}
									icon={tab.icon}
									label={tab.label}
									active={activeTab === tab.value}
									onClick={() => setActiveTab(tab.value)}
									badge={
										tab.value === "doses" && prepBadge ? (
											<span
												className={`ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 ${
													prepBadge === "protected" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
												}`}
											>
												{prepBadge === "protected" ? (
													<Check className="h-2.5 w-2.5 stroke-[3.5]" />
												) : (
													<TriangleAlert className="h-2.5 w-2.5 stroke-[3]" />
												)}
											</span>
										) : undefined
									}
								/>
							))}
						</div>
					</div>
				</div>
			</header>

			<FeedScrollContainer>
				<div className="mx-auto w-full max-w-4xl pb-[calc(env(safe-area-inset-bottom,0px)+120px)]">
					{activeTab === "doses" && (
						<SexualHealthDosesTab
							headerSlotEl={headerSlotEl}
							fabSlotEl={fabSlotEl}
							scheme={prepScheme}
							onDosesChanged={() => setPrepRefreshKey((key) => key + 1)}
						/>
					)}
					{activeTab === "history" && <SexualHealthHistoryTab headerSlotEl={headerSlotEl} fabSlotEl={fabSlotEl} />}
					{activeTab === "appointments" && (
						<SexualHealthAppointmentsTab headerSlotEl={headerSlotEl} fabSlotEl={fabSlotEl} />
					)}
					{activeTab === "tests" && <SexualHealthTestsTab headerSlotEl={headerSlotEl} fabSlotEl={fabSlotEl} />}
				</div>
			</FeedScrollContainer>

			<div className="fixed inset-x-0 bottom-36 z-[60] pointer-events-none md:bottom-40">
				<div className="relative mx-auto h-full w-full max-w-4xl px-4 md:px-10">
					<div ref={setFabSlotEl} className="absolute bottom-0 right-[16%] translate-x-1/2 pointer-events-auto empty:pointer-events-none" />
				</div>
			</div>

			{isSettingsOpen && (
				<SexualHealthPrepSettingsSheet
					scheme={prepScheme}
					onSchemeChange={setPrepScheme}
					onClose={() => setIsSettingsOpen(false)}
				/>
			)}
		</section>
	);
}
