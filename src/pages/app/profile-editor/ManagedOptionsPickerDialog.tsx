import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Search, X } from "lucide-react";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { Chip } from "../../../components/ui/chip";
import { useDesktopBreakpoint } from "../../../hooks/useDesktopBreakpoint";
import type { ManagedOption } from "../GridPage.types";

interface ManagedOptionsPickerDialogProps {
	title: string;
	searchPlaceholder: string;
	noMatchesLabel: string;
	options: ManagedOption[];
	selected: number[];
	max: number;
	maxMessage: string;
	onToggle: (value: number) => void;
	onClose: () => void;
}

export function ManagedOptionsPickerDialog({
	title,
	searchPlaceholder,
	noMatchesLabel,
	options,
	selected,
	max,
	maxMessage,
	onToggle,
	onClose,
}: ManagedOptionsPickerDialogProps) {
	const isDesktop = useDesktopBreakpoint();
	const [query, setQuery] = useState("");

	const filteredOptions = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return options;
		}
		return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
	}, [options, query]);

	const handleToggle = (value: number) => {
		const alreadySelected = selected.includes(value);
		if (!alreadySelected && selected.length >= max) {
			toast.error(maxMessage);
			return;
		}
		onToggle(value);
	};

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} panelClassName="max-h-[82dvh]">
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">{title}</p>
				<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>
			<div className="px-4 pb-4">
				<label className="relative block">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
					<input
						type="text"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={searchPlaceholder}
						className="input-field pl-9 pr-9"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text)]"
						>
							<X className="h-4 w-4" />
						</button>
					)}
				</label>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
				{filteredOptions.length > 0 ? (
					<div className="flex flex-wrap gap-2.5">
						{filteredOptions.map((option) => {
							const active = selected.includes(option.value);
							return (
								<Chip key={option.value} selected={active} onClick={() => handleToggle(option.value)}>
									{option.label}
								</Chip>
							);
						})}
					</div>
				) : (
					<p className="py-6 text-center text-sm text-[var(--text-muted)]">{noMatchesLabel}</p>
				)}
			</div>
		</BottomSheet>
	);
}
