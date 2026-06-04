import { invoke, isTauri } from "@tauri-apps/api/core";

export type RuntimeMode = "manager" | "child";

export type RuntimeContext = {
    mode: RuntimeMode;
    instanceLabel: string;
};

function normalizeMode(raw: unknown): RuntimeMode {
    return raw === "manager" ? "manager" : "child";
}

export async function getRuntimeContext(): Promise<RuntimeContext> {
    if (!isTauri()) {
        return { mode: "child", instanceLabel: "default" };
    }

    try {
        const value = await invoke<{ mode: string; instanceLabel: string }>("runtime_context");
        return {
            mode: normalizeMode(value.mode),
            instanceLabel: value.instanceLabel || "default",
        };
    } catch {
        return { mode: "child", instanceLabel: "default" };
    }
}