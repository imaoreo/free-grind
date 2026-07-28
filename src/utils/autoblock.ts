import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { getSetting, setSetting } from "../services/chatDb";
import { appLog } from "./logger";

export async function notifyAutoBlock(profileName: string, reason: string) {
    appLog.info(`[AutoBlock] Banned: ${profileName} | Reason: ${reason}`);

    if (!isTauriRuntime()) return;

    try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === "granted";
        }

        if (permissionGranted) {
            sendNotification({
                title: "Free Grind Auto-Blocker",
                body: `Blocked: ${profileName}\n${reason}`, // Shows the full message now!
            });
        }
    } catch (e) {
        appLog.error("Failed to send notification", e);
    }
}

// ---------------------------------------------------------------------------
// Automation settings — backed by the active profile's db (chatDb), kept in
// an in-memory cache. The forbidden-words list here is now the shared
// keyword source for custom automation rules (see automationRules.ts's
// useForbiddenList conditions) — the keyword *matching* itself (auto-block
// on chat/grid) moved into the automation rule engine.
// ---------------------------------------------------------------------------

export interface AutomationSettings {
    forbiddenWords: string;
}

const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
    forbiddenWords: "",
};

const AUTOMATION_SETTINGS_KEY = "automation";

let automationCache: AutomationSettings = DEFAULT_AUTOMATION_SETTINGS;

/**
 * Populates the in-memory automation cache from the active profile's db.
 * Awaited by AuthContext before it flips settingsReady, so by the time any
 * consumer observes settingsReady=true the cache already reflects the
 * active profile.
 */
export async function loadAutomationCache(): Promise<void> {
    try {
        const stored = await getSetting<Partial<AutomationSettings>>(AUTOMATION_SETTINGS_KEY);
        automationCache = { ...DEFAULT_AUTOMATION_SETTINGS, ...stored };
    } catch (error) {
        appLog.error("[AutoBlock] failed to load automation settings", error);
        automationCache = DEFAULT_AUTOMATION_SETTINGS;
    }
}

export function getAutomationSettings(): AutomationSettings {
    return automationCache;
}

export async function setAutomationSettings(
    patch: Partial<AutomationSettings>,
): Promise<AutomationSettings> {
    automationCache = { ...automationCache, ...patch };
    await setSetting(AUTOMATION_SETTINGS_KEY, automationCache);
    return automationCache;
}

export function getForbiddenWords(): string {
    return automationCache.forbiddenWords;
}

export async function setForbiddenWords(value: string): Promise<void> {
    await setAutomationSettings({ forbiddenWords: value });
}
