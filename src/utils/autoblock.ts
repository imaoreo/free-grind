import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
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

let cachedKeywords: string[] = [];
let cachedRegex: RegExp | null = null;
let lastSavedWords: string | null = null;

// NEW: Returns the exact word that triggered the block
export function getMatchedForbiddenWord(text: string | null | undefined, context: "grid" | "chat"): string | null {
    if (!text) return null;
    const isGridEnabled = window.localStorage.getItem("fg-block-grid") === "true";
    const isChatEnabled = window.localStorage.getItem("fg-block-chat") !== "false"; 

    if (context === "grid" && !isGridEnabled) return null;
    if (context === "chat" && !isChatEnabled) return null;

    const savedWords = window.localStorage.getItem("fg-forbidden-words") || "";
    
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
    const isGridEnabled = window.localStorage.getItem("fg-block-grid") === "true";
    const isChatEnabled = window.localStorage.getItem("fg-block-chat") !== "false"; 

    if (context === "grid" && !isGridEnabled) return false;
    if (context === "chat" && !isChatEnabled) return false;

    const rawMin = window.localStorage.getItem("fg-block-min-age");
    const rawMax = window.localStorage.getItem("fg-block-max-age");

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