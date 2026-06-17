import React from "react";
import { Ruler } from "lucide-react";
import { Chip } from "../../../components/ui/chip";

export function CategoryHeader({
	title,
	description,
	icon: Icon,
	action,
}: {
	title: string;
	description: string;
	icon: typeof Ruler;
	action?: React.ReactNode;
}) {
	return (
		<div className="mb-5 flex items-start gap-3">
			<div className="rounded-2xl p-2.5 bg-[var(--surface-2)] text-[var(--text-muted)] shrink-0">
				<Icon className="h-5 w-5" strokeWidth={2.1} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
					{title}
				</p>
				<h3 className="mt-0.5 text-base font-semibold leading-tight">{description}</h3>
			</div>
			{action && <div className="shrink-0">{action}</div>}
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
