import { useEffect, useState } from "react";

/**
 * Steps 0 -> maxPhase, one requestAnimationFrame apart. Lets the first paint
 * (the actual routed page) commit before non-visual startup bridges (realtime
 * websocket, push notifications, route tracking, entitlements, ...) mount one
 * at a time across subsequent frames, instead of all of them committing
 * alongside the initial route in the same first render — spreads their setup
 * cost (effects, listeners, native bridge calls) over time instead of
 * bursting it all into the first frame.
 */
export function useRenderPhase(maxPhase: number): number {
	const [phase, setPhase] = useState(0);

	useEffect(() => {
		if (phase >= maxPhase) {
			return;
		}
		const frame = requestAnimationFrame(() => setPhase((p) => p + 1));
		return () => cancelAnimationFrame(frame);
	}, [phase, maxPhase]);

	return phase;
}
