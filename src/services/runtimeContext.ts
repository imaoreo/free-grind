import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, readTextFile } from "@tauri-apps/plugin-fs";

export type RuntimeMode = "manager" | "child";

export type RuntimeContext = {
    mode: RuntimeMode;
    instanceLabel: string;
};

function normalizeMode(raw: unknown): RuntimeMode {
    return raw === "manager" ? "manager" : "child";
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function parseTraceContext(raw: string): RuntimeContext | null {
    const lines = raw.split(/\r?\n/);
    const map = new Map<string, string>();

    for (const line of lines) {
        const idx = line.indexOf("=");
        if (idx <= 0) {
            continue;
        }
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        map.set(key, value);
    }

    const mode = normalizeMode(map.get("mode"));
    const label = map.get("label") || map.get("FREE_GRIND_INSTANCE") || "default";

    return {
        mode,
        instanceLabel: label,
    };
}

async function getTraceRuntimeContext(): Promise<RuntimeContext | null> {
    const tracePath = "AppData/Local/free-grind/manager/runtime-mode.txt";
    try {
        const traceExists = await exists(tracePath, { baseDir: BaseDirectory.Home });
        if (!traceExists) {
            return null;
        }

        const trace = await readTextFile(tracePath, { baseDir: BaseDirectory.Home });
        return parseTraceContext(trace);
    } catch {
        return null;
    }
}

export async function getRuntimeContext(): Promise<RuntimeContext> {
    const maxAttempts = 20;
    const retryDelayMs = 100;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const value = await invoke<{ mode: string; instanceLabel: string }>("runtime_context");
            const resolved: RuntimeContext = {
                mode: normalizeMode(value.mode),
                instanceLabel: value.instanceLabel || "default",
            };

            const traceContext = await getTraceRuntimeContext();
            if (traceContext && traceContext.mode === "manager") {
                return traceContext;
            }

            return resolved;
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                await sleep(retryDelayMs);
            }
        }
    }

    const traceContext = await getTraceRuntimeContext();
    if (traceContext) {
        return traceContext;
    }

    console.warn("[runtime-context] falling back to child/default after retries", lastError);
    return { mode: "child", instanceLabel: "default" };
}