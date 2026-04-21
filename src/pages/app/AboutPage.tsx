import {
	ArrowLeft,
	BookOpen,
	FileText,
	GitBranch,
	HeartHandshake,
	Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const resourceLinks = [
	{
		title: "Documentation",
		href: "https://opengrind.estopia.net",
		description: "Reverse-engineered API notes and developer-facing reference.",
		icon: BookOpen,
		external: true,
	},
	{
		title: "Source Code",
		href: "https://github.com/kezza2k7/open-grind",
		description: "Track progress, inspect the code, and follow releases.",
		icon: GitBranch,
		external: true,
	},
	{
		title: "Contributing",
		href: "https://github.com/kezza2k7/open-grind/blob/main/CONTRIBUTING.md",
		description:
			"Project structure, contribution rules, and collaboration notes.",
		icon: HeartHandshake,
		external: true,
	},
	{
		title: "Licence",
		href: "https://github.com/kezza2k7/open-grind/blob/main/LICENSE",
		description: "Personal-use licence and attribution requirements.",
		icon: FileText,
		external: true,
	},
];

export function AboutPage() {
	const navigate = useNavigate();

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-5xl gap-6">
				<header className="grid gap-4">
					<button
						type="button"
						onClick={() => navigate("/settings")}
						className="inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Settings
					</button>

					<div className="surface-card overflow-hidden p-5 sm:p-7">
						<div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
							<div className="grid gap-4">
								<p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
									About Open Grind
								</p>
								<div className="grid gap-3">
									<h1 className="app-title max-w-[12ch]">
										A privacy-centered Grindr client without ads or trackers.
									</h1>
									<p className="max-w-[65ch] text-sm leading-6 text-[var(--text-muted)] sm:text-base">
										Open Grind is an unofficial cross-platform client focused on
										personal-use freedom, cleaner UX, and transparent
										community-led documentation.
									</p>
								</div>

								<div className="grid gap-3 sm:grid-cols-3">
									<div className="rounded-2xl bg-[var(--surface-2)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											Platform
										</p>
										<p className="mt-2 text-base font-semibold">
											Tauri + React
										</p>
									</div>
									<div className="rounded-2xl bg-[var(--surface-2)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											Model
										</p>
										<p className="mt-2 text-base font-semibold">
											Ad-free personal use
										</p>
									</div>
									<div className="rounded-2xl bg-[var(--surface-2)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											Focus
										</p>
										<p className="mt-2 text-base font-semibold">
											Privacy and community docs
										</p>
									</div>
								</div>
							</div>

							<div className="rounded-[28px] bg-[var(--surface-2)] p-5 sm:p-6">
								<div className="inline-flex rounded-full bg-[var(--accent)]/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-contrast)]">
									Credits
								</div>
								<p className="mt-4 text-lg font-semibold leading-snug">
									Credits: Estopia Engineering Ltd (SC874827, UK)
								</p>
								<p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
									The in-app credit is preserved here to satisfy the personal
									use licence and keep ownership visible.
								</p>
								<div className="mt-5 flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-4">
									<div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-[var(--text)]">
										<Shield className="h-5 w-5" />
									</div>
									<p className="text-sm leading-6 text-[var(--text-muted)]">
										Commercial use is reserved. Personal use, learning, and
										private experimentation are allowed under the included
										licence.
									</p>
								</div>
							</div>
						</div>
					</div>
				</header>

				<div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
					<section className="surface-card p-5 sm:p-6">
						<h2 className="text-lg font-semibold">What this project is for</h2>
						<div className="mt-4 grid gap-4 text-sm leading-6 text-[var(--text-muted)]">
							<p>
								This app aims to make the core experience lighter and clearer
								while keeping the implementation transparent. The documentation
								effort is a major part of the project, not an afterthought.
							</p>
							<p>
								Current priorities in the codebase are browse, profiles, account
								editing, and the foundations for bigger features like messaging
								and interest history.
							</p>
						</div>
					</section>

					<section className="surface-card p-5 sm:p-6">
						<h2 className="text-lg font-semibold">Support the project</h2>
						<div className="mt-4 grid gap-3 text-sm text-[var(--text-muted)]">
							<p>Donation links currently listed by the project:</p>
							<a
								href="https://estopia.net/donate"
								target="_blank"
								rel="noreferrer"
								className="rounded-2xl bg-[var(--surface-2)] px-4 py-3 font-medium text-[var(--text)]"
							>
								estopia.net/donate
							</a>
							<a
								href="https://hloth.dev/donate"
								target="_blank"
								rel="noreferrer"
								className="rounded-2xl bg-[var(--surface-2)] px-4 py-3 font-medium text-[var(--text)]"
							>
								hloth.dev/donate
							</a>
						</div>
					</section>
				</div>

				<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{resourceLinks.map((resource) => {
						const Icon = resource.icon;

						return (
							<a
								key={resource.title}
								href={resource.href}
								target={resource.external ? "_blank" : undefined}
								rel={resource.external ? "noreferrer" : undefined}
								className="surface-card grid gap-4 p-5 transition-transform duration-150 hover:-translate-y-0.5"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="rounded-2xl bg-[var(--surface-2)] p-3">
										<Icon className="h-5 w-5" />
									</div>
									<span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
										{resource.external ? "External" : "Local"}
									</span>
								</div>
								<div className="grid gap-2">
									<h2 className="text-base font-semibold">{resource.title}</h2>
									<p className="text-sm leading-6 text-[var(--text-muted)]">
										{resource.description}
									</p>
								</div>
							</a>
						);
					})}
				</section>
			</div>
		</section>
	);
}
