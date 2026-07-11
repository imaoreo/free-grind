import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

const LAST_TESTED_MONTH_RANGE = 24;

/**
 * Custom month/year dropdown for "last tested" — <input type="month"> doesn't
 * get a real picker UI in every desktop webview (just bare clickable
 * month/year segments), and two plain <select>s side by side read as clunky.
 * This lists the last 24 months (always includes the current one, so it
 * doubles as the "no future dates" cap) as a single scrollable list.
 */
export function LastTestedMonthPicker({
	value,
	onChange,
	notSetLabel,
}: {
	value: string;
	onChange: (next: string) => void;
	notSetLabel: string;
}) {
	const { i18n } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const monthFormatter = useMemo(
		() => new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }),
		[i18n.language],
	);

	const options = useMemo(() => {
		const now = new Date();
		return Array.from({ length: LAST_TESTED_MONTH_RANGE }, (_, i) => {
			const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
			return {
				value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
				label: monthFormatter.format(date),
			};
		});
	}, [monthFormatter]);

	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (event: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	const selectedOption = options.find((option) => option.value === value);
	const selectedLabel = value
		? (selectedOption?.label ?? monthFormatter.format(new Date(`${value}-01T00:00:00.000Z`)))
		: notSetLabel;

	return (
		<div className="relative" ref={containerRef}>
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="input-field flex w-full items-center justify-between text-left"
			>
				<span className={value ? "" : "text-[var(--text-muted)]"}>{selectedLabel}</span>
				<ChevronDown
					className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>
			{isOpen && (
				<div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
					<button
						type="button"
						onClick={() => {
							onChange("");
							setIsOpen(false);
						}}
						className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-2)] ${
							!value ? "font-semibold text-[var(--accent)]" : "text-[var(--text-muted)]"
						}`}
					>
						{notSetLabel}
					</button>
					{options.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => {
								onChange(option.value);
								setIsOpen(false);
							}}
							className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-2)] ${
								value === option.value ? "font-semibold text-[var(--accent)]" : ""
							}`}
						>
							{option.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
