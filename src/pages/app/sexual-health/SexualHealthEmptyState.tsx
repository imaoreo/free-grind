import type { ReactNode } from "react";

interface SexualHealthEmptyStateProps {
	icon: ReactNode;
	title: string;
	description?: string;
}

// Matches the Saved Phrases empty state (ChatThreadPanel.tsx):
// rounded-2xl icon tile (not a circle), same spacing/type scale — centered
// in the available scroll area rather than just padded at the top.
export function SexualHealthEmptyState({ icon, title, description }: SexualHealthEmptyStateProps) {
	return (
		<div className="flex min-h-[60dvh] flex-col items-center justify-center gap-2.5 px-[var(--app-px)] text-center text-[var(--text-muted)]">
			<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
				{icon}
			</div>
			<p className="text-sm font-medium text-[var(--text)]">{title}</p>
			{description ? <p className="max-w-xs text-xs opacity-60">{description}</p> : null}
		</div>
	);
}
