import type { ReactNode } from "react";
import { Card } from "./card";

export function AuthShell({
	title,
	subtitle,
	children,
	footer,
}: {
	title: string;
	subtitle: string;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-[var(--bg)] p-4">
			<Card className="w-full max-w-md p-6 sm:max-w-lg sm:p-8 md:p-10">
				<div className="mb-5 flex justify-center">
					<img
						src="/newLogo.webp"
						alt="Open Grind"
						className="h-14 w-14 rounded-2xl object-cover"
					/>
				</div>
				<h1 className="app-title mb-2">{title}</h1>
				<p className="app-subtitle mb-7">{subtitle}</p>
				{children}
				{footer ? <div className="mt-5 text-center">{footer}</div> : null}
			</Card>
		</div>
	);
}
