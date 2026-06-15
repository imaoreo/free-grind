/**
 * Renders fatal errors directly into the DOM via vanilla JS so they remain visible
 * even if React itself has crashed and got destroyed (black screen), tho this works 50/50
 */

let overlayEl: HTMLDivElement | null = null;
const seenMessages = new Set<string>();

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

export function installGlobalCrashHandlers() {
	if (typeof window === "undefined") return;

	window.addEventListener("error", (event) => {
		showCrashOverlay(
			`Uncaught error: ${event.message}`,
			event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`,
		);
	});

	window.addEventListener("unhandledrejection", (event) => {
		const reason = event.reason;
		const message = reason instanceof Error ? reason.message : String(reason);
		const stack = reason instanceof Error ? reason.stack : undefined;
		showCrashOverlay(`Unhandled rejection: ${message}`, stack);
	});
}
