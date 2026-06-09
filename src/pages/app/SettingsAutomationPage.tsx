import { useState } from "react";
import { Ban, Clock, Download, RefreshCw, Save, Tag, Upload, Users } from "lucide-react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import { RangeSlider, Slider } from "../../components/ui/range-slider";

export function SettingsAutomationPage() {
	const { t } = useTranslation();

	const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
	const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
	const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") || "18");
	const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") || "99");
	const [refreshEnabled, setRefreshEnabled] = useState(() => window.localStorage.getItem("fg-auto-refresh-enabled") === "true");
	const [refreshInterval, setRefreshInterval] = useState(() => window.localStorage.getItem("fg-auto-refresh-interval") || "5");

	const handleToggleChatBlock = (val: boolean) => {
		setBlockOnChat(val);
		window.localStorage.setItem("fg-block-chat", String(val));
		toast.success(val ? t("settings_automation.chat_block_enabled") : t("settings_automation.chat_block_disabled"), { id: "chat-block-toggle" });
	};

	const handleToggleRefresh = (val: boolean) => {
		setRefreshEnabled(val);
		window.localStorage.setItem("fg-auto-refresh-enabled", String(val));
		toast.success(val ? t("settings_automation.auto_refresh_enabled") : t("settings_automation.auto_refresh_disabled"), { id: "refresh-toggle" });
	};

	const handleSaveAutoBlock = () => {
		window.localStorage.setItem("fg-forbidden-words", forbiddenWords);
		window.localStorage.setItem("fg-block-min-age", minAge);
		window.localStorage.setItem("fg-block-max-age", maxAge);
		toast.success(t("settings_automation.block_rules_updated"));
	};

	const handleSaveRefresh = () => {
		window.localStorage.setItem("fg-auto-refresh-interval", refreshInterval);
		toast.success(t("settings_automation.refresh_settings_updated"));
	};

	const handleExport = () => {
		const blob = new Blob([forbiddenWords], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "free-grind-keywords.txt";
		a.click();
		URL.revokeObjectURL(url);
		toast.success(t("settings_automation.keywords_exported"));
	};

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			setForbiddenWords(text);
			toast.success(t("settings_automation.keywords_imported"));
		};
		reader.readAsText(file);
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.automation")}</h1>
				<p className="app-subtitle">{t("settings.automation_desc")}</p>
			</header>

			<div className="grid gap-6">
				{/* AUTO BLOCK */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.auto_block_title")}
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						<ToggleRow
							icon={<Ban className="h-5 w-5" />}
							iconClass="bg-red-500/15 text-red-400"
							label={t("settings_automation.apply_to_inbox")}
							description={t("settings_automation.apply_to_inbox_desc")}
							checked={blockOnChat}
							onChange={handleToggleChatBlock}
						/>

						{blockOnChat && <div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-orange-500/15 p-2.5 text-orange-400">
								<Tag className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("settings_automation.forbidden_keywords_title")}
								</p>
								<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
									{t("settings_automation.forbidden_keywords_desc")}
								</p>
								<textarea
									value={forbiddenWords}
									onChange={(e) => setForbiddenWords(e.target.value)}
									placeholder={t("settings_automation.keywords_placeholder")}
									className="input-field mt-3 min-h-[100px] resize-y"
								/>
								<div className="mt-2 grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={handleExport}
										className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold transition hover:border-[var(--text-muted)]"
									>
										<Download className="h-3.5 w-3.5" />
										{t("settings_automation.export_txt")}
									</button>
									<label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold transition hover:border-[var(--text-muted)]">
										<Upload className="h-3.5 w-3.5" />
										{t("settings_automation.import_txt")}
										<input type="file" accept=".txt" onChange={handleImport} className="hidden" />
									</label>
								</div>
							</div>
						</div>}

						{blockOnChat && <div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
								<Users className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("settings_automation.age_limits_title")}
								</p>
								<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
									{t("settings_automation.age_limits_desc")}
								</p>
								<div className="mt-4 px-2">
									<RangeSlider
										label={t("browse_filters.age")}
										min={18}
										max={99}
										minDefault={Number(minAge)}
										maxDefault={Number(maxAge)}
										onChange={(min, max) => {
											setMinAge(String(min));
											setMaxAge(String(max));
										}}
									/>
								</div>
							</div>
						</div>}

						{blockOnChat && <div className="p-4">
							<button
								type="button"
								onClick={handleSaveAutoBlock}
								className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
							>
								<Save className="h-4 w-4" />
								{t("settings_automation.update_block_rules")}
							</button>
						</div>}
					</div>
				</div>

				{/* AUTO REFRESH */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.auto_refresh_title")}
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						<ToggleRow
							icon={<RefreshCw className="h-5 w-5" />}
							iconClass="bg-green-500/15 text-green-400"
							label={t("settings_automation.enable_refresh")}
							description={t("settings_automation.enable_refresh_desc")}
							checked={refreshEnabled}
							onChange={handleToggleRefresh}
						/>

						{refreshEnabled && <div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-blue-500/15 p-2.5 text-blue-400">
								<Clock className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
										{t("settings_automation.refresh_interval")}
									</p>
									<span className="shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-bold">
										{t("settings_automation.refresh_interval_unit", { count: refreshInterval })}
									</span>
								</div>
								<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
									{t("settings_automation.refresh_technical_note")}
								</p>
								<div className="mt-3 px-2">
									<Slider
										label=""
										hideHeader
										min={5}
										max={60}
										step={5}
										defaultValue={Number(refreshInterval)}
										displayValue={t("settings_automation.refresh_interval_unit", { count: refreshInterval })}
										onChange={(val) => setRefreshInterval(String(val))}
									/>
									<div className="flex justify-between mt-1">
										<span className="text-[10px] text-[var(--text-muted)]">5 min</span>
										<span className="text-[10px] text-[var(--text-muted)]">60 min</span>
									</div>
								</div>
							</div>
						</div>}

						{refreshEnabled && <div className="p-4">
							<button
								type="button"
								onClick={handleSaveRefresh}
								className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
							>
								<Save className="h-4 w-4" />
								{t("settings_automation.update_refresh_settings")}
							</button>
						</div>}
					</div>
				</div>
			</div>
		</section>
	);
}
