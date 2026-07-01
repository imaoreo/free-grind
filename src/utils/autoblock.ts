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
// an in-memory cache so the hot-path checkers below (called per-message
// during chat/grid filtering) can stay synchronous instead of awaiting a db
// round-trip on every check.
// ---------------------------------------------------------------------------

export interface AutomationSettings {
    blockOnChat: boolean;
    blockGrid: boolean;
    forbiddenWords: string;
    minAge: string;
    maxAge: string;
    refreshEnabled: boolean;
    refreshInterval: string;
}

const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
    blockOnChat: false,
    blockGrid: false,
    forbiddenWords: "",
    minAge: "18",
    maxAge: "99",
    refreshEnabled: false,
    refreshInterval: "5",
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
    lastSavedWords = null;
}

export function getAutomationSettings(): AutomationSettings {
    return automationCache;
}

export async function setAutomationSettings(
    patch: Partial<AutomationSettings>,
): Promise<AutomationSettings> {
    automationCache = { ...automationCache, ...patch };
    await setSetting(AUTOMATION_SETTINGS_KEY, automationCache);
    lastSavedWords = null;
    return automationCache;
}

export function getForbiddenWords(): string {
    return automationCache.forbiddenWords;
}

export async function setForbiddenWords(value: string): Promise<void> {
    await setAutomationSettings({ forbiddenWords: value });
}

export function getAutoRefreshSettings(): { enabled: boolean; intervalMinutes: string } {
    return { enabled: automationCache.refreshEnabled, intervalMinutes: automationCache.refreshInterval };
}

let cachedKeywords: string[] = [];
let cachedRegex: RegExp | null = null;
let lastSavedWords: string | null = null;

// NEW: Returns the exact word that triggered the block
export function getMatchedForbiddenWord(text: string | null | undefined, context: "grid" | "chat"): string | null {
    if (!text) return null;
    const isGridEnabled = automationCache.blockGrid;
    const isChatEnabled = automationCache.blockOnChat;

    if (context === "grid" && !isGridEnabled) return null;
    if (context === "chat" && !isChatEnabled) return null;

    const savedWords = automationCache.forbiddenWords;

    // Cache logic: only re-compile regex if keywords changed
    if (savedWords !== lastSavedWords) {
        lastSavedWords = savedWords;
        cachedKeywords = savedWords.split(',')
            .map(word => word.trim().toLowerCase())
            .filter(word => word.length > 0);
        
        if (cachedKeywords.length > 0) {
            // Sort by length descending to ensure "Snapchat" matches before "Snap"
            const sortedKeywords = [...cachedKeywords].sort((a, b) => b.length - a.length);
            const pattern = sortedKeywords
                .map(keyword => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('|');
            // Using a capturing group for the keywords and non-capturing groups for boundaries
            cachedRegex = new RegExp(`(?:^|\\W)(${pattern})(?:$|\\W)`, 'i');
        } else {
            cachedRegex = null;
        }
    }

    if (!cachedRegex) return null;

    const lowerText = text.toLowerCase();
    const match = lowerText.match(cachedRegex);
    if (match) {
        // Return the first captured group (the actual keyword)
        return match[1];
    }

    return null;
}

// Keep this for the Grid/Inbox where we only need true/false
export function shouldAutoBlock(text: string | null | undefined, context: "grid" | "chat"): boolean {
    return getMatchedForbiddenWord(text, context) !== null;
}

export function isOutsideAgeLimits(age: number | null | undefined, context: "grid" | "chat"): boolean {
    if (age == null) return false;
    const isGridEnabled = automationCache.blockGrid;
    const isChatEnabled = automationCache.blockOnChat;

    if (context === "grid" && !isGridEnabled) return false;
    if (context === "chat" && !isChatEnabled) return false;

    const rawMin = automationCache.minAge;
    const rawMax = automationCache.maxAge;

    if (rawMin && rawMin.trim() !== "") {
        const minAge = parseInt(rawMin.trim(), 10);
        if (!isNaN(minAge) && age < minAge) return true;
    }
    if (rawMax && rawMax.trim() !== "") {
        const maxAge = parseInt(rawMax.trim(), 10);
        if (!isNaN(maxAge) && age > maxAge) return true;
    }

    return false;
}