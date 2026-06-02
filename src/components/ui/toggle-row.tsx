export function ToggleRow({
	checked,
	onChange,
	label,
	description,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description?: string;
}) {
	return (
		<label className={`flex min-h-14 justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 ${description ? "items-start" : "items-center"}`}>
			<span>
				<span className="block text-sm font-medium">{label}</span>
				{description ? (
					<span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
						{description}
					</span>
				) : null}
			</span>
			<span className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center ${description ? "mt-1" : ""}`}>
				<input
					type="checkbox"
					checked={checked}
					onChange={(event) => onChange(event.target.checked)}
					className="peer sr-only"
				/>
				<span className="absolute inset-0 rounded-full border border-[var(--border)] bg-[var(--surface)] transition-colors peer-checked:border-transparent peer-checked:bg-[var(--accent)]" />
				<span className="absolute left-1 h-5 w-5 rounded-full bg-[var(--text)] transition-transform peer-checked:translate-x-5 peer-checked:bg-[var(--accent-contrast)]" />
			</span>
		</label>
	);
}
