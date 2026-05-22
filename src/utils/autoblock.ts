// Returns true if the text has a bad word AND the specific toggle is enabled
export function shouldAutoBlock(text: string | null | undefined, context: "grid" | "chat"): boolean {
    if (!text) return false;
    
    // Check if the toggle is enabled for this context
    const isGridEnabled = window.localStorage.getItem("fg-block-grid") === "true";
    const isChatEnabled = window.localStorage.getItem("fg-block-chat") !== "false"; // Default true

    if (context === "grid" && !isGridEnabled) return false;
    if (context === "chat" && !isChatEnabled) return false;

    // Grab the words
    const savedWords = window.localStorage.getItem("fg-forbidden-words");
    if (!savedWords || savedWords.trim() === "") return false;

    const keywords = savedWords.split(',').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    if (keywords.length === 0) return false;

    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
}