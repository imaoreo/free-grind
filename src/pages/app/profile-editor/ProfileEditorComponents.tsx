import { Ruler } from "lucide-react";
import { Chip } from "../../../components/ui/chip";

export function CategoryHeader({
	title,
	description,
	icon: Icon,
}: {
	title: string;
	description: string;
	icon: typeof Ruler;
}) {
	return (
		<div className="mb-5 flex items-start gap-3">
			<div className="mt-0.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)]">
				<Icon className="h-4 w-4" strokeWidth={2.1} />
			</div>
			<div className="space-y-1">
				<p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
					{title}
				</p>
				<h3 className="text-lg font-semibold leading-tight">{description}</h3>
			</div>
		</div>
	);
}

export function ToggleRow({
	checked,
	onChange,
	label,
	description,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description: string;
}) {
	return (
		<label className="flex min-h-14 items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5">
			<span>
				<span className="block text-sm font-medium">{label}</span>
				<span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
					{description}
				</span>
			</span>
			<span className="relative mt-1 inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center">
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

export function ChipGroup({
	options,
	selected,
	onToggle,
}: {
	options: Array<{ value: number; label: string }>;
	selected: number[];
	onToggle: (value: number) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2.5">
			{options.map((option) => {
				const active = selected.includes(option.value);

				return (
					<Chip
						key={option.value}
						selected={active}
						onClick={() => onToggle(option.value)}
						className={active ? "hover:brightness-[1.02]" : undefined}
					>
						{option.label}
					</Chip>
				);
			})}
		</div>
	);
}
