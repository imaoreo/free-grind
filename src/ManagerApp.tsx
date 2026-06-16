import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

type ManagerAppProps = {
    currentLabel: string;
};

function normalizeLabel(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

export default function ManagerApp({ currentLabel }: ManagerAppProps) {
    const [instances, setInstances] = useState<string[]>([]);
    const [newLabel, setNewLabel] = useState("");
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [renameValues, setRenameValues] = useState<Record<string, string>>({});

    const launchHint = useMemo(() => {
        return "Set FREE_GRIND_INSTANCE=<label> before launching child.exe, or run child.exe --instance=<label>.";
    }, []);

    useEffect(() => {
        if (!isTauri()) return;

        void (async () => {
            try {
                const labels = await invoke<string[]>("list_child_instances");
                setInstances(labels);
            } catch {
                setStatusMessage("Failed to load managed instances.");
            }
        })();
    }, []);

    async function addInstance() {
        const label = normalizeLabel(newLabel);
        if (!label) return;
        if (instances.includes(label)) {
            setStatusMessage(`Instance already exists: ${label}`);
            return;
        }

        let persistedLabel = label;
        if (isTauri()) {
            try {
                persistedLabel = await invoke<string>("create_child_instance", {
                    label,
                });
            } catch (error) {
                const message =
                    typeof error === "string"
                        ? error
                        : error && typeof error === "object" && "message" in error
                          ? String((error as { message?: unknown }).message)
                          : "Failed to create child instance.";
                setStatusMessage(message);
                return;
            }
        }

        const next = [...instances, persistedLabel].sort();
        setInstances(next);
        setNewLabel("");
        setStatusMessage(`Created instance: ${persistedLabel}`);
    }

    async function removeInstance(label: string) {
        if (isTauri()) {
            try {
                await invoke("remove_child_instance", { label });
            } catch (error) {
                const message =
                    typeof error === "string"
                        ? error
                        : "Failed to remove child instance.";
                setStatusMessage(message);
                return;
            }
        }

        const next = instances.filter((instanceLabel) => instanceLabel !== label);
        setInstances(next);
        setStatusMessage(`Removed instance: ${label}`);
    }

    async function renameInstance(oldLabel: string) {
        const draft = normalizeLabel(renameValues[oldLabel] ?? "");
        if (!draft) {
            setStatusMessage("Enter a valid new label.");
            return;
        }

        if (draft === oldLabel) {
            setStatusMessage("New label is the same as current label.");
            return;
        }

        let finalLabel = draft;
        if (isTauri()) {
            try {
                finalLabel = await invoke<string>("rename_child_instance", {
                    oldLabel,
                    newLabel: draft,
                });
            } catch (error) {
                const message =
                    typeof error === "string"
                        ? error
                        : "Failed to rename child instance.";
                setStatusMessage(message);
                return;
            }
        }

        const next = instances
            .map((instanceLabel) =>
                instanceLabel === oldLabel ? finalLabel : instanceLabel,
            )
            .sort();
        setInstances(next);
        setRenameValues((prev) => {
            const copy = { ...prev };
            delete copy[oldLabel];
            return copy;
        });
        setStatusMessage(`Renamed ${oldLabel} -> ${finalLabel}`);
    }

    async function launchInstance(label: string) {
        if (!isTauri()) {
            setStatusMessage("Launch is only available inside the Tauri desktop app.");
            return;
        }

        try {
            await invoke("launch_child_instance", { label });
            setStatusMessage(`Launched child instance: ${label}`);
        } catch (error) {
            const message =
                typeof error === "string"
                    ? error
                    : error && typeof error === "object" && "message" in error
                      ? String((error as { message?: unknown }).message)
                      : "Failed to launch child instance.";
            setStatusMessage(message);
        }
    }

    return (
        <main className="app-screen p-4 sm:p-8">
            <section className="surface-card mx-auto max-w-3xl p-6 sm:p-8">
                <h1 className="text-2xl font-bold">Free Grind Manager</h1>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Manager mode is active. Create labeled child instances with isolated app data.
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Current manager label: <strong>{currentLabel}</strong>
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <input
                        value={newLabel}
                        onChange={(event) => setNewLabel(event.target.value)}
                        placeholder="Instance label (for example: bos-01)"
                        className="h-10 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm"
                    />
                    <button
                        type="button"
                        onClick={() => void addInstance()}
                        className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)]"
                    >
                        Add Instance
                    </button>
                </div>

                <p className="mt-3 text-xs text-[var(--text-muted)]">{launchHint}</p>
                {statusMessage ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{statusMessage}</p>
                ) : null}

                <ul className="mt-6 space-y-3">
                    {instances.length === 0 ? (
                        <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
                            No saved instances yet.
                        </li>
                    ) : null}

                    {instances.map((label) => (
                        <li
                            key={label}
                            className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold">{label}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    Launch arg: --instance={label}
                                </p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                    <input
                                        value={renameValues[label] ?? ""}
                                        onChange={(event) =>
                                            setRenameValues((prev) => ({
                                                ...prev,
                                                [label]: event.target.value,
                                            }))
                                        }
                                        placeholder="Rename label"
                                        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void renameInstance(label)}
                                        className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs"
                                    >
                                        Rename
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void launchInstance(label)}
                                    className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--on-accent)]"
                                >
                                    Launch Child
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void removeInstance(label)}
                                    className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs"
                                >
                                    Remove
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    );
}
