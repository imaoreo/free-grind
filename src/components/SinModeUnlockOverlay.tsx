import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeSinModeUnlock } from "../utils/sinModeEasterEgg";

const AUTO_DISMISS_MS = 10000;
const CLOSE_ANIMATION_MS = 280;

export function SinModeUnlockOverlay() {
	const [visible, setVisible] = useState(false);
	const [closing, setClosing] = useState(false);

	useEffect(() => subscribeSinModeUnlock(() => {
		setClosing(false);
		setVisible(true);
	}), []);

	useEffect(() => {
		if (!visible || closing) {
			return;
		}
		const timer = setTimeout(() => setClosing(true), AUTO_DISMISS_MS);
		return () => clearTimeout(timer);
	}, [visible, closing]);

	useEffect(() => {
		if (!closing) {
			return;
		}
		const timer = setTimeout(() => setVisible(false), CLOSE_ANIMATION_MS);
		return () => clearTimeout(timer);
	}, [closing]);

	if (!visible) {
		return null;
	}

	return createPortal(
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
			style={{ animation: closing ? "backdrop-out 0.28s ease-in forwards" : "backdrop-in 0.3s ease-out forwards" }}
			onClick={() => setClosing(true)}
			role="dialog"
			aria-label="Sin Mode unlocked"
		>
			<div className="sin-mode-backdrop absolute inset-0" />
			<div className="sin-mode-rays absolute h-[220vmax] w-[220vmax] animate-sin-mode-rays" />

			<div
				className="relative flex flex-col items-center gap-4 px-8 text-center"
				style={{ animation: closing ? "modal-out 0.22s ease-in forwards" : undefined }}
			>
				<div className="sin-mode-halo relative flex h-32 w-40 items-center justify-center rounded-full animate-sin-mode-shimmer">
					<span
						className="animate-sin-mode-in text-6xl leading-none"
						style={{ animationDelay: "0ms" }}
					>
						🍆
					</span>
					<span
						className="animate-sin-mode-in -mx-1 text-7xl leading-none"
						style={{ animationDelay: "90ms" }}
					>
						😈
					</span>
					<span
						className="animate-sin-mode-in text-6xl leading-none"
						style={{ animationDelay: "180ms" }}
					>
						🍑
					</span>
				</div>

				<h1 className="sin-mode-title animate-sin-mode-title-in text-4xl font-black uppercase tracking-widest text-fuchsia-400 sm:text-5xl">
					Sin Mode
				</h1>
				<p className="animate-sin-mode-title-in text-sm font-semibold uppercase tracking-[0.3em] text-white/80">
					Unlocked
				</p>
				<p className="animate-sin-mode-title-in mt-2 max-w-xs text-sm text-white/60">
					You've been very, very bad. Developer Mode is now yours.
				</p>
			</div>
		</div>,
		document.body,
	);
}
