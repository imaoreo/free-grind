export function ToggleRow({
	checked,
	onChange,
	label,
	description,
	icon,
	iconClass,
	activeColor,
	activeThumbColor,
	dense,
	labelClassName,
	padding: paddingProp,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description?: string;
	icon?: React.ReactNode;
	iconClass?: string;
	activeColor?: string;
	activeThumbColor?: string;
	dense?: boolean;
	/** Overrides the label's default sentence-style typography — used for plain, borderless rows that should match the small-caps field-label style used elsewhere on the page. */
	labelClassName?: string;
	/** Overrides the row's default padding — pass "" for a borderless row that shouldn't add its own inset. */
	padding?: string;
}) {
	const hasIcon = icon !== undefined;
	const padding = paddingProp ?? (dense ? "p-3" : "px-4 py-3.5");

	return (
		<label
			className={
				hasIcon
					? `flex cursor-pointer items-start gap-3 ${padding} transition-colors hover:bg-[var(--surface-2)]`
					: `flex min-h-14 cursor-pointer justify-between gap-4 ${padding} ${description ? "items-start" : "items-center"}`
			}
		>
			{hasIcon && (
				<div className={`shrink-0 rounded-2xl p-2.5 ${iconClass ?? ""}`}>{icon}</div>
			)}
			<span className={hasIcon ? "min-w-0 flex-1" : ""}>
				<span className={labelClassName ?? `block text-sm ${hasIcon ? "font-semibold leading-snug" : "font-medium"}`}>
					{label}
				</span>
				{description && (
					<span className={`block text-xs leading-relaxed text-[var(--text-muted)] ${hasIcon ? "mt-0.5" : "mt-1"}`}>
						{description}
					</span>
				)}
			</span>
			<span
				className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center ${!hasIcon && description ? "mt-1" : hasIcon ? "mt-0.5" : ""}`}
				style={{
					"--toggle-active": activeColor ?? "var(--accent)",
					"--toggle-thumb-active": activeThumbColor ?? "var(--accent-contrast)",
				} as React.CSSProperties}
			>
				<input
					type="checkbox"
					checked={checked}
					onChange={(event) => onChange(event.target.checked)}
					onClick={(e) => e.stopPropagation()}
					className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
				/>
				<span className="absolute inset-0 rounded-full border border-[var(--border)] bg-[var(--surface)] transition-colors peer-checked:border-transparent peer-checked:bg-[var(--toggle-active)]" />
				<span className="absolute left-1 h-5 w-5 rounded-full bg-[var(--text)] transition-transform peer-checked:translate-x-5 peer-checked:bg-[var(--toggle-thumb-active)]" />
			</span>
		</label>
	);
}
