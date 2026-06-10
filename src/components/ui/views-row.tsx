export function SegmentedRow<T extends string | number>({
	value,
	onChange,
	label,
	options,
}: {
	value: T;
	onChange: (value: T) => void;
	label: string;
	options: { value: T; label: string }[];
}) {
	return (
		<div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5">
			<span className="text-sm font-medium">{label}</span>
			<div className="flex gap-1">
				{options.map((opt) => (
					<button
						key={String(opt.value)}
						type="button"
						onClick={() => onChange(opt.value)}
						className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold transition ${
							value === opt.value
								? "bg-[var(--accent)] text-white"
								: "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
						}`}
					>
						{opt.label}
					</button>
				))}
			</div>
		</div>
	);
}
