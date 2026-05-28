// --- PER-CHAT GHOST MODE LOGIC ---
export function isChatGhosted(conversationId: string): boolean {
    const globalGhost = window.localStorage.getItem("fg-ghost-mode") === "true";
    const exceptionsStr = window.localStorage.getItem("fg-ghost-exceptions") || "{}";
    
    try {
        // Tell TypeScript exactly what shape this object is
        const exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>;
        
        if (typeof exceptions[conversationId] === "boolean") {
            return exceptions[conversationId];
        }
    } catch {}
    
    return globalGhost;
}

export function toggleChatGhost(conversationId: string): boolean {
    const currentState = isChatGhosted(conversationId);
    const exceptionsStr = window.localStorage.getItem("fg-ghost-exceptions") || "{}";
    
    try {
        const exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>;
        exceptions[conversationId] = !currentState;
        window.localStorage.setItem("fg-ghost-exceptions", JSON.stringify(exceptions));
    } catch {
        window.localStorage.setItem("fg-ghost-exceptions", JSON.stringify({ [conversationId]: !currentState }));
    }
    return !currentState;
}