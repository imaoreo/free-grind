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

export { ToggleRow } from "../../../components/ui/toggle-row";

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
