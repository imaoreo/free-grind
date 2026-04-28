import { useCallback, useEffect, useState, useRef } from "react";

interface RangeSliderProps {
	min: number;
	max: number;
	step?: number;
	minDefault: number;
	maxDefault: number;
	label: string;
	unit?: string;
	onChange: (min: number, max: number) => void;
}

interface SliderProps {
	min: number;
	max: number;
	step?: number;
	defaultValue: number;
	label: string;
	displayValue: string;
	onChange: (value: number) => void;
}

/**
 * Shared styles for both RangeSlider and Slider components.
 *
 * DESIGN NOTE:
 * Styling range inputs across different WebViews (WebKit on iOS/Android, WebView2 on Windows)
 * requires vendor-specific pseudo-elements. We use pointer-events: none on the container
 * and pointer-events: all on the thumb to allow overlapping inputs in the RangeSlider.
 */
const sliderStyles = `
	/* Resetting default browser range styles */
	.thumb,
	.thumb::-webkit-slider-thumb {
		-webkit-appearance: none;
		-webkit-tap-highlight-color: transparent;
	}

	.thumb {
		pointer-events: none; /* Disable interaction on the container track */
		position: absolute;
		height: 0;
		width: 100%;
		outline: none;
		background: none;
	}

	.thumb--left {
		z-index: 3;
	}

	.thumb--right {
		z-index: 4;
	}

	.thumb--single {
		z-index: 5;
	}

	/* Webkit (Chrome, Safari, Edge) Thumb styling */
	.thumb::-webkit-slider-thumb {
		background-color: var(--accent);
		border: 2px solid var(--accent-contrast);
		border-radius: 50%;
		box-shadow: 0 0 1px 1px var(--border);
		cursor: pointer;
		height: 20px;
		width: 20px;
		margin-top: 4px;
		pointer-events: all; /* Re-enable interaction specifically for the thumb */
		position: relative;
	}

	/* Firefox Thumb styling */
	.thumb::-moz-range-thumb {
		background-color: var(--accent);
		border: 2px solid var(--accent-contrast);
		border-radius: 50%;
		box-shadow: 0 0 1px 1px var(--border);
		cursor: pointer;
		height: 20px;
		width: 20px;
		pointer-events: all; /* Re-enable interaction specifically for the thumb */
		position: relative;
	}

	/* Custom Track Styling */
	.slider {
		position: relative;
		width: 100%;
	}

	.slider__track,
	.slider__range {
		border-radius: 3px;
		height: 4px;
		position: absolute;
	}

	.slider__track {
		background-color: var(--surface-2);
		width: 100%;
		z-index: 1;
		border: 1px solid var(--border);
	}

	.slider__range {
		background-color: var(--accent);
		z-index: 2;
	}
`;

/**
 * A custom Dual-Range Slider component for selecting a range (min/max).
 */
export function RangeSlider({
	min,
	max,
	step = 1,
	minDefault,
	maxDefault,
	label,
	unit = "",
	onChange,
}: RangeSliderProps) {
	const [minValue, setMinValue] = useState(minDefault);
	const [maxValue, setMaxValue] = useState(maxDefault);
	const minValRef = useRef(minDefault);
	const maxValRef = useRef(maxDefault);
	const range = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setMinValue(minDefault);
		minValRef.current = minDefault;
	}, [minDefault]);

	useEffect(() => {
		setMaxValue(maxDefault);
		maxValRef.current = maxDefault;
	}, [maxDefault]);

	const getPercent = useCallback(
		(value: number) => Math.round(((value - min) / (max - min)) * 100),
		[min, max],
	);

	useEffect(() => {
		if (maxValRef.current !== null) {
			const minPercent = getPercent(minValue);
			const maxPercent = getPercent(maxValRef.current);
			if (range.current) {
				range.current.style.left = `${minPercent}%`;
				range.current.style.width = `${maxPercent - minPercent}%`;
			}
		}
	}, [minValue, getPercent]);

	useEffect(() => {
		if (minValRef.current !== null) {
			const minPercent = getPercent(minValRef.current);
			const maxPercent = getPercent(maxValue);
			if (range.current) {
				range.current.style.width = `${maxPercent - minPercent}%`;
			}
		}
	}, [maxValue, getPercent]);

	return (
		<div className="flex flex-col gap-4 py-2">
			<div className="flex justify-between items-center">
				<span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
					{label}
				</span>
				<span className="text-xs font-medium bg-[var(--surface-2)] px-2 py-0.5 rounded-md border border-[var(--border)]">
					{minValue}{unit} - {maxValue}{maxValue >= max ? "+" : ""}{unit}
				</span>
			</div>

			<div className="relative h-10 flex items-center">
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={minValue}
					onChange={(event) => {
						const value = Math.min(Number(event.target.value), maxValue - step);
						setMinValue(value);
						minValRef.current = value;
						onChange(value, maxValue);
					}}
					className="thumb thumb--left"
					style={{ zIndex: minValue > max - 100 ? "5" : undefined }}
				/>
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={maxValue}
					onChange={(event) => {
						const value = Math.max(Number(event.target.value), minValue + step);
						setMaxValue(value);
						maxValRef.current = value;
						onChange(minValue, value);
					}}
					className="thumb thumb--right"
				/>

				<div className="slider">
					<div className="slider__track" />
					<div ref={range} className="slider__range" />
				</div>
			</div>

			<style>{sliderStyles}</style>
		</div>
	);
}

/**
 * A custom Single-Handle Slider component for selecting a single value.
 * Used for filters like "Max Distance".
 */
export function Slider({
	min,
	max,
	step = 1,
	defaultValue,
	label,
	displayValue,
	onChange,
}: SliderProps) {
	const [value, setValue] = useState(defaultValue);

	useEffect(() => {
		setValue(defaultValue);
	}, [defaultValue]);

	const getPercent = useCallback(
		(val: number) => Math.round(((val - min) / (max - min)) * 100),
		[min, max],
	);

	return (
		<div className="flex flex-col gap-4 py-2">
			<div className="flex justify-between items-center">
				<span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
					{label}
				</span>
				<span className="text-xs font-medium bg-[var(--surface-2)] px-2 py-0.5 rounded-md border border-[var(--border)]">
					{displayValue}
				</span>
			</div>

			<div className="relative h-10 flex items-center">
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={(event) => {
						const val = Number(event.target.value);
						setValue(val);
						onChange(val);
					}}
					className="thumb thumb--single"
				/>

				<div className="slider">
					<div className="slider__track" />
					<div
						className="slider__range"
						style={{ width: `${getPercent(value)}%` }}
					/>
				</div>
			</div>

			<style>{sliderStyles}</style>
		</div>
	);
}
