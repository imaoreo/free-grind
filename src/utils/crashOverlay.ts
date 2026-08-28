/**
 * Renders fatal errors directly into the DOM via vanilla JS so they remain visible
 * even if React itself has crashed and got destroyed (black screen), tho this works 50/50
 */

let overlayEl: HTMLDivElement | null = null;
const seenMessages = new Set<string>();

function errorText(value: unknown): string {
	if (value == null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (value instanceof Error) {
		return `${value.message}\n${value.stack ?? ""}`;
	}
	// WebKit TypeErrors from Tauri's injected user-script can fail `instanceof Error`.
	try {
		const maybe = value as { message?: unknown; stack?: unknown };
		return `${String(maybe.message ?? value)}\n${String(maybe.stack ?? "")}`;
	} catch {
		return String(value);
	}
}

function isBenignTauriUnlistenError(text: string): boolean {
	return (
		text.includes("listeners[eventId]") ||
		text.includes("handlerId") ||
		text.includes("unregisterListener")
	);
}

function ensureOverlay(): HTMLDivElement {
	if (overlayEl) return overlayEl;

	const el = document.createElement("div");
	el.id = "crash-overlay";
	el.style.position = "fixed";
	el.style.inset = "0";
	el.style.zIndex = "2147483647";
	el.style.background = "rgba(20, 0, 0, 0.95)";
	el.style.color = "#fff";
	el.style.fontFamily = "monospace";
	el.style.fontSize = "12px";
	el.style.lineHeight = "1.4";
	el.style.padding = "calc(env(safe-area-inset-top, 0px) + 16px) 12px 16px 12px";
	el.style.overflow = "auto";
	el.style.whiteSpace = "pre-wrap";
	el.style.wordBreak = "break-word";
	el.style.pointerEvents = "auto";

	const close = document.createElement("button");
	close.type = "button";
	close.textContent = "Dismiss";
	close.style.display = "block";
	close.style.margin = "0 0 16px auto";
	close.style.padding = "8px 12px";
	close.style.font = "inherit";
	close.style.color = "#fff";
	close.style.background = "rgba(255,255,255,0.15)";
	close.style.border = "1px solid rgba(255,255,255,0.35)";
	close.style.borderRadius = "8px";
	close.addEventListener("click", () => {
		el.remove();
		overlayEl = null;
		seenMessages.clear();
	});
	el.appendChild(close);

	document.body.appendChild(el);
	overlayEl = el;
	return el;
}

export function showCrashOverlay(title: string, detail?: string) {
	const key = `${title}\n${detail ?? ""}`;
	if (seenMessages.has(key)) return;
	seenMessages.add(key);

	const el = ensureOverlay();

	const block = document.createElement("div");
	block.style.marginBottom = "12px";
	block.style.paddingBottom = "12px";
	block.style.borderBottom = "1px solid rgba(255,255,255,0.2)";

	const titleEl = document.createElement("div");
	titleEl.style.fontWeight = "bold";
	titleEl.style.color = "#ff6b6b";
	titleEl.textContent = title;
	block.appendChild(titleEl);

	if (detail) {
		const detailEl = document.createElement("div");
		detailEl.style.marginTop = "4px";
		detailEl.style.opacity = "0.85";
		detailEl.textContent = detail;
		block.appendChild(detailEl);
	}

	el.appendChild(block);
}

function swallowBenignUnlistenError(error: unknown): boolean {
	if (isBenignTauriUnlistenError(errorText(error))) {
		return true;
	}
	return false;
}

function patchTauriEventUnlisten() {
	const internals = window.__TAURI_EVENT_PLUGIN_INTERNALS__;
	if (!internals || typeof internals.unregisterListener !== "function") {
		return false;
	}
	const patched = internals as typeof internals & { __fgSafeUnlisten?: boolean };
	if (patched.__fgSafeUnlisten) {
		return true;
	}
	const original = internals.unregisterListener.bind(internals);
	internals.unregisterListener = (event: string, eventId: number) => {
		try {
			const result = original(event, eventId) as unknown;
			if (result && typeof (result as Promise<unknown>).then === "function") {
				return Promise.resolve(result).catch((error) => {
					if (!swallowBenignUnlistenError(error)) {
						throw error;
					}
				});
			}
			return result;
		} catch (error) {
			if (!swallowBenignUnlistenError(error)) {
				throw error;
			}
		}
	};
	patched.__fgSafeUnlisten = true;
	return true;
}

export function installGlobalCrashHandlers() {
	if (typeof window === "undefined") return;

	if (!patchTauriEventUnlisten()) {
		let attempts = 0;
		const timer = window.setInterval(() => {
			attempts += 1;
			if (patchTauriEventUnlisten() || attempts > 200) {
				window.clearInterval(timer);
			}
		}, 10);
	}

	window.addEventListener("error", (event) => {
		const text = `${event.message ?? ""}\n${errorText(event.error)}`;
		if (isBenignTauriUnlistenError(text)) {
			event.preventDefault();
			return;
		}
		showCrashOverlay(
			`Uncaught error: ${event.message}`,
			event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`,
		);
	});

	window.addEventListener(
		"unhandledrejection",
		(event) => {
			const reason = event.reason;
			const text = errorText(reason);
			if (isBenignTauriUnlistenError(text)) {
				event.preventDefault();
				return;
			}
			const message = reason instanceof Error ? reason.message : String(reason);
			const stack = reason instanceof Error ? reason.stack : undefined;
			showCrashOverlay(`Unhandled rejection: ${message}`, stack);
		},
		true,
	);
}
