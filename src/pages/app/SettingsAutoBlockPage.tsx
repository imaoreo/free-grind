import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldBan, ChevronLeft, Save, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";

export function SettingsAutoBlockPage() {
    const navigate = useNavigate();

    const [blockOnGrid, setBlockOnGrid] = useState(() => window.localStorage.getItem("fg-block-grid") === "true");
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") !== "false");
    const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
    const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") || "");
    const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") || "");

    const handleSave = () => {
        window.localStorage.setItem("fg-block-grid", String(blockOnGrid));
        window.localStorage.setItem("fg-block-chat", String(blockOnChat));
        window.localStorage.setItem("fg-forbidden-words", forbiddenWords);
        window.localStorage.setItem("fg-block-min-age", minAge);
        window.localStorage.setItem("fg-block-max-age", maxAge);
        toast.success("Auto-Block settings saved!");
    };

    const handleExport = () => {
        const blob = new Blob([forbiddenWords], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "free-grind-keywords.txt";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Keywords exported!");
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setForbiddenWords(text);
            toast.success("Keywords imported! Make sure to click Save below.");
        };
        reader.readAsText(file);
    };

    return (
        <section className="app-screen">
            <header className="mb-6 flex items-center gap-4">
                <button
                    type="button"
                    onClick={() => navigate("/settings")}
                    className="rounded-full bg-[var(--surface-2)] p-2 transition-transform hover:-translate-y-0.5"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                    <h1 className="app-title flex items-center gap-2">
                        <ShieldBan className="h-6 w-6 text-red-400" />
                        Auto-Block Features
                    </h1>
                    <p className="app-subtitle">Configure automated blocking rules.</p>
                </div>
            </header>

            <div className="grid gap-6">
                {/* Toggles */}
                <div className="surface-card p-4 sm:p-5">
                    <h2 className="text-base font-semibold mb-3">Where to apply rules?</h2>
                    <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-3 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={blockOnGrid}
                                onChange={(e) => setBlockOnGrid(e.target.checked)}
                                className="h-4 w-4 accent-[var(--accent)]"
                            />
                            Apply to Grid Profiles (Hides them instantly)
                        </label>
                        <label className="flex items-center gap-3 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={blockOnChat}
                                onChange={(e) => setBlockOnChat(e.target.checked)}
                                className="h-4 w-4 accent-[var(--accent)]"
                            />
                            Apply to Inbox (Instantly blocks new chats)
                        </label>
                    </div>
                </div>

                {/* Keywords */}
                <div className="surface-card p-4 sm:p-5">
                    <h2 className="text-base font-semibold mb-1">Forbidden Keywords</h2>
                    <p className="text-sm text-[var(--text-muted)] mb-3">
                        Block profiles or messages containing these words. Separate with commas (e.g. snapchat, crypto, bot).
                    </p>
                    <textarea
                        value={forbiddenWords}
                        onChange={(e) => setForbiddenWords(e.target.value)}
                        placeholder="Type keywords here..."
                        className="w-full min-h-[100px] rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                    />
                    <div className="flex gap-2 mt-3">
                        <button type="button" onClick={handleExport} className="flex-1 flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs h-9 transition hover:border-[var(--accent)]">
                            <Download className="mr-2 h-4 w-4" /> Export (.txt)
                        </button>
                        <label className="flex-1 flex items-center justify-center cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs h-9 transition hover:border-[var(--accent)]">
                            <Upload className="mr-2 h-4 w-4" /> Import (.txt)
                            <input type="file" accept=".txt" onChange={handleImport} className="hidden" />
                        </label>
                    </div>
                </div>

                {/* Age Filter */}
                <div className="surface-card p-4 sm:p-5">
                    <h2 className="text-base font-semibold mb-1">Age Limits</h2>
                    <p className="text-sm text-[var(--text-muted)] mb-3">
                        Block anyone outside of this age range. Leave blank to ignore.
                    </p>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="text-xs text-[var(--text-muted)]">Minimum Age</label>
                            <input
                                type="number"
                                value={minAge}
                                onChange={(e) => setMinAge(e.target.value)}
                                placeholder="e.g. 18"
                                className="w-full rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none mt-1"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-[var(--text-muted)]">Maximum Age</label>
                            <input
                                type="number"
                                value={maxAge}
                                onChange={(e) => setMaxAge(e.target.value)}
                                placeholder="e.g. 99"
                                className="w-full rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none mt-1"
                            />
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <Button type="button" onClick={handleSave} className="w-full py-4 text-base font-bold">
                    <Save className="h-5 w-5 mr-2" />
                    Save Auto-Block Settings
                </Button>
            </div>
        </section>
    );
}