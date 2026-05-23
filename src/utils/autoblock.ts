import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";

// Helper function to send a native Windows/Android/iOS notification
export async function notifyAutoBlock(profileName: string, reason: string) {
    console.log(`[AutoBlock] Banned: ${profileName} | Reason: ${reason}`);

    // If we are running in the browser (not the installed .exe), we can't send OS notifications
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
                body: `Blocked: ${profileName}\nReason: ${reason}`,
            });
        }
    } catch (e) {
        console.error("Failed to send auto-block notification", e);
    }
}

export function shouldAutoBlock(text: string | null | undefined, context: "grid" | "chat"): boolean {
    if (!text) return false;
    
    const isGridEnabled = window.localStorage.getItem("fg-block-grid") === "true";
    const isChatEnabled = window.localStorage.getItem("fg-block-chat") !== "false"; 

    if (context === "grid" && !isGridEnabled) return false;
    if (context === "chat" && !isChatEnabled) return false;

    const savedWords = window.localStorage.getItem("fg-forbidden-words");
    if (!savedWords || savedWords.trim() === "") return false;

    const keywords = savedWords.split(',').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    if (keywords.length === 0) return false;

    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
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
        if (!isNaN(minAge) && age < minAge) {
            return true;
        }
    }

    if (rawMax && rawMax.trim() !== "") {
        const maxAge = parseInt(rawMax.trim(), 10);
        if (!isNaN(maxAge) && age > maxAge) {
            return true;
        }
    }

    return false;
}