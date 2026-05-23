import { Droplet, Plus, Pencil, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RIGHT_NOW_SESSION_DURATION, RIGHT_NOW_TEST_SESSION_DURATION } from "./rightnow-constants";

export type RightNowFABPhase = "idle" | "loading" | "countdown";

interface RightNowPostFABProps {
	onClick: () => void;
	phase?: RightNowFABPhase;
	onPhaseChange?: (phase: RightNowFABPhase) => void;
	isEditMode?: boolean;
	expiresAt?: number | null;
	rightNowRemaining?: number;
	isTestMode?: boolean;
}

const SCALE_FACTOR = 3;
const LOGICAL_SIZE = 120 * SCALE_FACTOR;
const CENTER = LOGICAL_SIZE / 2;
const MAX_OFFSET = 336.15;
const CANVAS_RADIUS = 53.5;

export function RightNowPostFAB({
	onClick,
	phase: externalPhase = "idle",
	onPhaseChange,
	isEditMode = false,
	expiresAt,
	rightNowRemaining = 0,
	isTestMode = false,
}: RightNowPostFABProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const ringRef = useRef<SVGCircleElement>(null);

	const [currentPhase, setCurrentPhase] = useState<RightNowFABPhase>(externalPhase);
	const phaseRef = useRef<RightNowFABPhase>(externalPhase);
	const lastExternalPhaseRef = useRef<RightNowFABPhase | null>(null);
	const startTimeRef = useRef<number | null>(null);
	const particlesRef = useRef<Particle[]>([]);
	const requestRef = useRef<number>(0);
	const accentColorRef = useRef<string>("#9333ea");
	const expiresAtRef = useRef<number | null>(expiresAt ?? null);

	const loadDuration = 2500;
	const countdownDuration = isTestMode ? RIGHT_NOW_TEST_SESSION_DURATION : RIGHT_NOW_SESSION_DURATION;

	useEffect(() => {
		expiresAtRef.current = expiresAt ?? null;
	}, [expiresAt]);

	// Robust state synchronization
	useEffect(() => {
		if (externalPhase !== lastExternalPhaseRef.current) {
			const isFirstMount = lastExternalPhaseRef.current === null;
			lastExternalPhaseRef.current = externalPhase;

			// Check for expiration
			const isExpired = expiresAtRef.current ? Date.now() >= expiresAtRef.current : false;
			if (externalPhase === "countdown" && isExpired) {
				phaseRef.current = "idle";
				setCurrentPhase("idle");
				onPhaseChange?.("idle");
				return;
			}

			phaseRef.current = externalPhase;
			setCurrentPhase(externalPhase);

			if (externalPhase === "loading") {
				if (startTimeRef.current === null || !isFirstMount) {
					startTimeRef.current = Date.now();
				}
			} else if (externalPhase === "countdown") {
				// Reset startTime when transitioning to countdown to ensure progress starts at 0
				startTimeRef.current = Date.now();
			} else if (externalPhase === "idle") {
				startTimeRef.current = null;
				if (ringRef.current) {
					ringRef.current.style.strokeDashoffset = MAX_OFFSET.toString();
				}
			}
		}
	}, [externalPhase, onPhaseChange]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = LOGICAL_SIZE * dpr;
		canvas.height = LOGICAL_SIZE * dpr;
		ctx.scale(dpr, dpr);

		const animate = () => {
			ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

			let sparkX: number | undefined;
			let sparkY: number | undefined;

			const activePhase = phaseRef.current;

			if (activePhase === "loading" && startTimeRef.current !== null) {
				const elapsed = Date.now() - startTimeRef.current;
				const progress = Math.min(elapsed / loadDuration, 1);
				const easedProgress = Math.sin((progress * Math.PI) / 2);

				const currentAngle = -Math.PI / 2 + easedProgress * Math.PI * 2;
				sparkX = CENTER + Math.cos(currentAngle) * CANVAS_RADIUS;
				sparkY = CENTER + Math.sin(currentAngle) * CANVAS_RADIUS;

				if (ringRef.current) {
					ringRef.current.style.strokeDashoffset = (MAX_OFFSET - easedProgress * MAX_OFFSET).toString();
				}

				if (progress < 1) {
					for (let i = 0; i < 4; i++) {
						particlesRef.current.push(new Particle(sparkX, sparkY, accentColorRef.current));
					}
				} else {
					phaseRef.current = "countdown";
					setCurrentPhase("countdown");
					startTimeRef.current = Date.now();
					onPhaseChange?.("countdown");
				}
			} else if (activePhase === "countdown") {
				const now = Date.now();
				let progress = 0;

				const currentExpiresAt = expiresAtRef.current;
				if (currentExpiresAt) {
					const remaining = Math.max(0, currentExpiresAt - now);
					const total = countdownDuration;
					const effectiveRemaining = Math.min(remaining, total);
					progress = 1 - (effectiveRemaining / total);
				} else if (startTimeRef.current !== null) {
					const elapsed = now - startTimeRef.current;
					progress = Math.min(elapsed / countdownDuration, 1);
				}

				const currentAngle = -Math.PI / 2 + progress * Math.PI * 2;
				sparkX = CENTER + Math.cos(currentAngle) * CANVAS_RADIUS;
				sparkY = CENTER + Math.sin(currentAngle) * CANVAS_RADIUS;

				if (ringRef.current) {
					// Ring drains from full to empty clockwise from 12 o'clock
					// 2 * MAX_OFFSET is full (same as 0), 1 * MAX_OFFSET is empty
					ringRef.current.style.strokeDashoffset = ((2 - progress) * MAX_OFFSET).toString();
				}

				if (progress < 1) {
					for (let i = 0; i < 3; i++) {
						particlesRef.current.push(new Particle(sparkX, sparkY, accentColorRef.current));
					}
				} else {
					if (phaseRef.current !== "idle") {
						phaseRef.current = "idle";
						setCurrentPhase("idle");
						startTimeRef.current = null;
						onPhaseChange?.("idle");
					}
					if (ringRef.current) {
						ringRef.current.style.strokeDashoffset = MAX_OFFSET.toString();
					}
				}
			}

			particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0);
			for (const p of particlesRef.current) {
				p.update();
				p.draw(ctx);
			}

			requestRef.current = requestAnimationFrame(animate);
		};

		requestRef.current = requestAnimationFrame(animate);

		return () => {
			if (requestRef.current) cancelAnimationFrame(requestRef.current);
		};
	}, [onPhaseChange, countdownDuration]);

	return (
		<div className="flex h-20 w-20 select-none items-center justify-center">
			<canvas
				ref={canvasRef}
				className="pointer-events-none absolute z-30"
				style={{
					width: "240px",
					height: "240px",
					left: "-80px",
					top: "-80px",
				}}
			/>

			<svg className="absolute inset-0 z-10 h-full w-full -rotate-90" viewBox="0 0 120 120">
				{/* Background dashed ring */}
				<circle
					cx="60"
					cy="60"
					r="53.5"
					className="fill-transparent"
					stroke="var(--right-now)"
					strokeWidth="3"
					opacity="0.7"
				/>
				<circle
					ref={ringRef}
					cx="60"
					cy="60"
					r="53.5"
					className="fill-transparent"
					stroke="var(--right-now)"
					strokeWidth="6"
					strokeLinecap="round"
					style={{
						strokeDasharray: MAX_OFFSET.toString(),
						strokeDashoffset: MAX_OFFSET.toString(),
					}}
				/>
			</svg>

			<button
				type="button"
				onClick={onClick}
				className="z-20 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--right-now)] text-white shadow-xl transition-all duration-100 ease-out focus:outline-none active:scale-95 active:shadow-none hover:opacity-90"
				style={{
					boxShadow: "0 10px 25px -5px rgba(var(--right-now-rgb), 0.4)",
				}}
			>
				<div className="flex items-center justify-center">
					{isEditMode && currentPhase !== "idle" ? (
						<Pencil className="h-6 w-6 stroke-[2.5]" />
					) : !isEditMode && rightNowRemaining === 0 ? (
						<Lock className="h-6 w-6 stroke-[2.5]" />
					) : (
						<Plus className="h-8 w-8 stroke-[3]" />
					)}
				</div>
			</button>
		</div>
	);
}

class Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	alpha: number;
	decay: number;
	size: number;
	color: string;

	constructor(x: number, y: number, color: string) {
		this.x = x;
		this.y = y;
		this.color = color;
		const angle = Math.random() * Math.PI * 2;
		const speed = (Math.random() * 0.3 + 0.1) * SCALE_FACTOR;
		this.vx = Math.cos(angle) * speed;
		this.vy = Math.sin(angle) * speed;
		this.alpha = 1;
		this.decay = Math.random() * 0.05 + 0.04;
		this.size = (Math.random() * 1.0 + 0.5) * (SCALE_FACTOR * 0.4);
	}

	update() {
		this.x += this.vx;
		this.y += this.vy;
		this.alpha -= this.decay;
	}

	draw(ctx: CanvasRenderingContext2D) {
		const size = this.size;
		if (size <= 0) return;

		ctx.save();
		ctx.globalAlpha = this.alpha;
		ctx.shadowBlur = 4 * window.devicePixelRatio;
		ctx.shadowColor = this.color;
		ctx.fillStyle = Math.random() > 0.15 ? this.color : "#ffffff";

		ctx.beginPath();
		ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
}
