import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

function formatDuration(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function seededWaveform(seed: string, bars: number): number[] {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
	}
	return Array.from({ length: bars }, () => {
		h = Math.imul(1664525, h) + 1013904223 | 0;
		return 0.25 + (Math.abs(h) / 0x7fffffff) * 0.75;
	});
}

const SPEEDS = [1, 1.5, 2] as const;
const BARS = 36;

type Props = {
	src: string;
	messageId: string;
	mine: boolean;
};

export function AudioMessagePlayer({ src, messageId, mine }: Props) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const trackRef = useRef<HTMLDivElement | null>(null);
	const isDraggingRef = useRef(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [speedIdx, setSpeedIdx] = useState(0);

	const waveform = seededWaveform(messageId, BARS);
	const progress = duration > 0 ? currentTime / duration : 0;

	const rafRef = useRef<number | null>(null);
	const clipRef = useRef<HTMLDivElement | null>(null);
	const durationRef = useRef(0);

	const updateProgress = useCallback((t: number) => {
		const d = durationRef.current;
		if (clipRef.current && d > 0) {
			clipRef.current.style.clipPath = `inset(0 ${(1 - t / d) * 100}% 0 0)`;
		}
	}, []);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const tick = () => {
			if (!isDraggingRef.current) {
				updateProgress(audio.currentTime);
				setCurrentTime(audio.currentTime);
			}
			rafRef.current = requestAnimationFrame(tick);
		};

		const onPlay = () => { rafRef.current = requestAnimationFrame(tick); };
		const onPause = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
		const onMeta = () => {
			const d = isFinite(audio.duration) ? audio.duration : 0;
			durationRef.current = d;
			setDuration(d);
		};
		const onEnded = () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			setIsPlaying(false);
			setCurrentTime(0);
			updateProgress(0);
		};

		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("loadedmetadata", onMeta);
		audio.addEventListener("durationchange", onMeta);
		audio.addEventListener("ended", onEnded);
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("loadedmetadata", onMeta);
			audio.removeEventListener("durationchange", onMeta);
			audio.removeEventListener("ended", onEnded);
		};
	}, [updateProgress]);

	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (isPlaying) { audio.pause(); setIsPlaying(false); }
		else { void audio.play(); setIsPlaying(true); }
	};

	const cycleSpeed = () => {
		const next = (speedIdx + 1) % SPEEDS.length;
		setSpeedIdx(next);
		if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
	};

	const seekFromEvent = useCallback((clientX: number) => {
		const track = trackRef.current;
		const audio = audioRef.current;
		const d = durationRef.current;
		if (!track || !audio || d === 0) return;
		const rect = track.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		audio.currentTime = ratio * d;
		setCurrentTime(ratio * d);
		updateProgress(ratio * d);
	}, [updateProgress]);

	const onPointerDown = (e: React.PointerEvent) => {
		isDraggingRef.current = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		seekFromEvent(e.clientX);
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (isDraggingRef.current) seekFromEvent(e.clientX);
	};
	const onPointerUp = () => { isDraggingRef.current = false; };

	const barColor = mine ? "bg-[var(--accent-contrast)]" : "bg-[var(--accent)]";
	const btnColor = mine ? "bg-[var(--accent-contrast)] text-[var(--accent)]" : "bg-[var(--accent)] text-[var(--accent-contrast)]";
	const pillColor = mine
		? "bg-black/20 text-[var(--accent-contrast)]"
		: "bg-black/8 text-[var(--text)]";
	const timeColor = mine ? "text-[var(--accent-contrast)]/60" : "text-[var(--text-muted)]";

	return (
		<div className="flex w-64 items-center gap-2.5 py-1">
			<audio ref={audioRef} src={src} preload="metadata" className="hidden" />

			<button
				type="button"
				onClick={togglePlay}
				className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${btnColor} shadow-sm transition active:scale-95`}
			>
				{isPlaying
					? <Pause className="h-4 w-4 fill-current" />
					: <Play className="h-4 w-4 fill-current translate-x-[1px]" />
				}
			</button>

			<div
				ref={trackRef}
				className="relative flex flex-1 h-8 cursor-pointer items-center touch-none min-w-0"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				{/* inactive bars */}
				<div className="flex h-full w-full items-center gap-[2px]">
					{waveform.map((h, i) => (
						<div key={i} className={`flex-1 rounded-full opacity-25 ${barColor}`} style={{ height: `${Math.round(h * 100)}%` }} />
					))}
				</div>
				{/* active bars — clipped via direct DOM style update */}
				<div ref={clipRef} className="absolute inset-0 flex items-center gap-[2px]" style={{ clipPath: "inset(0 100% 0 0)" }}>
					{waveform.map((h, i) => (
						<div key={i} className={`flex-1 rounded-full ${barColor}`} style={{ height: `${Math.round(h * 100)}%` }} />
					))}
				</div>
			</div>

			<div className="flex shrink-0 flex-col items-center justify-center gap-0.5">
				<button
					type="button"
					onClick={cycleSpeed}
					className={`w-9 rounded-full py-0.5 text-center text-[11px] font-bold tabular-nums transition active:scale-95 ${pillColor}`}
				>
					{SPEEDS[speedIdx]}×
				</button>
				<span className={`text-[10px] tabular-nums ${timeColor}`}>
					{duration > 0
						? formatDuration(currentTime > 0 || isPlaying ? currentTime : duration)
						: "—"}
				</span>
			</div>
		</div>
	);
}
