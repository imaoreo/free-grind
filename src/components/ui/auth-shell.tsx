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
		<section className="app-screen flex items-center justify-center">
			<Card className="w-full max-w-md p-6 sm:p-8">
				<h1 className="app-title mb-2">{title}</h1>
				<p className="app-subtitle mb-6">{subtitle}</p>
				{children}
				{footer ? <div className="mt-4 text-center">{footer}</div> : null}
			</Card>
		</section>
	);
}
