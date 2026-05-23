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

// NEW AGE CHECKER
export function isOutsideAgeLimits(age: number | null | undefined, context: "grid" | "chat"): boolean {
    if (age == null) return false; 

    const isGridEnabled = window.localStorage.getItem("fg-block-grid") === "true";
    const isChatEnabled = window.localStorage.getItem("fg-block-chat") !== "false"; 

    if (context === "grid" && !isGridEnabled) return false;
    if (context === "chat" && !isChatEnabled) return false;

    const rawMin = window.localStorage.getItem("fg-block-min-age");
    const rawMax = window.localStorage.getItem("fg-block-max-age");

    // Only block if a minimum was actually typed in AND they are younger than it
    if (rawMin && rawMin.trim() !== "") {
        const minAge = parseInt(rawMin.trim(), 10);
        if (!isNaN(minAge) && age < minAge) {
            return true;
        }
    }

    // Only block if a maximum was actually typed in AND they are older than it
    if (rawMax && rawMax.trim() !== "") {
        const maxAge = parseInt(rawMax.trim(), 10);
        if (!isNaN(maxAge) && age > maxAge) {
            return true;
        }
    }

    return false; // Age is fine!
}