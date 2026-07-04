import { useState } from "react";
import { Bell, Flame, MessageCircle } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import {
	CHAT_NOTIFICATIONS_ENABLED_KEY,
	FOREGROUND_NOTIFICATIONS_ENABLED_KEY,
	TAP_NOTIFICATIONS_ENABLED_KEY,
	isChatNotificationsEnabled,
	isForegroundNotificationsEnabled,
	isTapNotificationsEnabled,
	syncNotificationSettingsToNative,
} from "../../utils/notificationSettings";

export function NotificationsPage() {
	const { t } = useTranslation();
	const [chatEnabled, setChatEnabled] = useState(() => isChatNotificationsEnabled());
	const [tapsEnabled, setTapsEnabled] = useState(() => isTapNotificationsEnabled());
	const [foregroundEnabled, setForegroundEnabled] = useState(() => isForegroundNotificationsEnabled());

	const setFlag = (key: string, value: boolean) => {
		window.localStorage.setItem(key, String(value));
		syncNotificationSettingsToNative();
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.notifications")}</h1>
				<p className="app-subtitle">{t("notifications_page.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
					<ToggleRow
						icon={<MessageCircle className="h-5 w-5" />}
						iconClass="bg-blue-500/15 text-blue-400"
						label={t("notifications_page.chat_enabled")}
						description={t("notifications_page.chat_enabled_desc")}
						checked={chatEnabled}
						onChange={(checked) => {
							setChatEnabled(checked);
							setFlag(CHAT_NOTIFICATIONS_ENABLED_KEY, checked);
						}}
					/>
					<ToggleRow
						icon={<Flame className="h-5 w-5" />}
						iconClass="bg-orange-500/15 text-orange-400"
						label={t("notifications_page.taps_enabled")}
						description={t("notifications_page.taps_enabled_desc")}
						checked={tapsEnabled}
						onChange={(checked) => {
							setTapsEnabled(checked);
							setFlag(TAP_NOTIFICATIONS_ENABLED_KEY, checked);
						}}
					/>
					<ToggleRow
						icon={<Bell className="h-5 w-5" />}
						iconClass="bg-[var(--surface-2)] text-[var(--text-muted)]"
						label={t("notifications_page.foreground")}
						description={t("notifications_page.foreground_desc")}
						checked={foregroundEnabled}
						onChange={(checked) => {
							setForegroundEnabled(checked);
							setFlag(FOREGROUND_NOTIFICATIONS_ENABLED_KEY, checked);
						}}
					/>
				</div>
			</div>
		</section>
	);
}
