// --- PER-CHAT READ RECEIPTS LOGIC ---
export const HIDE_READ_RECEIPTS_GLOBAL_KEY = "fg-hide-read-receipts";
export const SHOW_READ_RECEIPT_TOGGLE_KEY = "fg-show-read-receipt-toggle";
const READ_RECEIPTS_EXCEPTIONS_KEY = "fg-read-receipts-exceptions";

export function isReadReceiptsHidden(conversationId: string): boolean {
    const globalHidden = window.localStorage.getItem(HIDE_READ_RECEIPTS_GLOBAL_KEY) === "true";
    const exceptionsStr = window.localStorage.getItem(READ_RECEIPTS_EXCEPTIONS_KEY) || "{}";

    try {
        // Tell TypeScript exactly what shape this object is
        const exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>;

        if (typeof exceptions[conversationId] === "boolean") {
            return exceptions[conversationId];
        }
    } catch {}

    return globalHidden;
}

export function toggleReadReceiptsHidden(conversationId: string): boolean {
    const currentState = isReadReceiptsHidden(conversationId);
    const exceptionsStr = window.localStorage.getItem(READ_RECEIPTS_EXCEPTIONS_KEY) || "{}";

    try {
        const exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>;
        exceptions[conversationId] = !currentState;
        window.localStorage.setItem(READ_RECEIPTS_EXCEPTIONS_KEY, JSON.stringify(exceptions));
    } catch {
        window.localStorage.setItem(READ_RECEIPTS_EXCEPTIONS_KEY, JSON.stringify({ [conversationId]: !currentState }));
    }
    return !currentState;
}

// --- RECORD PROFILE VIEWS SETTING ---
export const RECORD_PROFILE_VIEWS_KEY = "fg-record-profile-views";

export function isRecordProfileViewsEnabled(): boolean {
    return window.localStorage.getItem(RECORD_PROFILE_VIEWS_KEY) !== "false";
}
