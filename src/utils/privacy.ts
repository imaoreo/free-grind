import { useEffect, useState } from "react";

// --- PER-CHAT READ RECEIPTS LOGIC ---
export const HIDE_READ_RECEIPTS_GLOBAL_KEY = "fg-hide-read-receipts";
export const SHOW_READ_RECEIPT_TOGGLE_KEY = "fg-show-read-receipt-toggle";
const READ_RECEIPTS_EXCEPTIONS_KEY = "fg-read-receipts-exceptions";

// localStorage writes don't trigger re-renders in other components, so anything
// that displays read-receipts state (e.g. the chat list) needs to be told to
// recompute when a toggle happens elsewhere (e.g. the chat thread header).
const READ_RECEIPTS_CHANGED_EVENT = "fg-read-receipts-changed";

function notifyReadReceiptsChanged() {
    window.dispatchEvent(new Event(READ_RECEIPTS_CHANGED_EVENT));
}

// Forces the calling component to re-render whenever read-receipts state
// changes anywhere in the app, so localStorage-derived values stay in sync.
export function useReadReceiptsChanged(): void {
    const [, setVersion] = useState(0);

    useEffect(() => {
        const handler = () => setVersion((v) => v + 1);
        window.addEventListener(READ_RECEIPTS_CHANGED_EVENT, handler);
        return () => window.removeEventListener(READ_RECEIPTS_CHANGED_EVENT, handler);
    }, []);
}

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
    notifyReadReceiptsChanged();
    return !currentState;
}

// --- RECORD PROFILE VIEWS SETTING ---
export const RECORD_PROFILE_VIEWS_KEY = "fg-record-profile-views";

export function isRecordProfileViewsEnabled(): boolean {
    return window.localStorage.getItem(RECORD_PROFILE_VIEWS_KEY) !== "false";
}
