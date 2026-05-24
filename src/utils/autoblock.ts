import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";

export async function notifyAutoBlock(profileName: string, reason: string) {
    console.log(`[AutoBlock] Banned: ${profileName} | Reason: ${reason}`);

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
        console.error("Failed to send notification", e);
    }
}

// NEW: Returns the exact word that triggered the block
export function getMatchedForbiddenWord(text: string | null | undefined, context: "grid" | "chat"): string | null {
    if (!text) return null;
    const isGridEnabled = window.localStorage.getItem("fg-block-grid") === "true";
    const isChatEnabled = window.localStorage.getItem("fg-block-chat") !== "false"; 

    if (context === "grid" && !isGridEnabled) return null;
    if (context === "chat" && !isChatEnabled) return null;

    const savedWords = window.localStorage.getItem("fg-forbidden-words");
    if (!savedWords || savedWords.trim() === "") return null;

    const keywords = savedWords.split(',').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    if (keywords.length === 0) return null;

    const lowerText = text.toLowerCase();
    
    for (const keyword of keywords) {
        // Escape special characters so emojis and punctuation don't break the scanner
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // This Regex ensures it only matches the exact word/phrase, not partial words like "bottle"
        const regex = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
        
        if (regex.test(lowerText)) {
            return keyword;
        }
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