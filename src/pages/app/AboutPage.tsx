import {
	BookOpen,
	FileText,
	GitBranch,
	HeartHandshake,
	LockKeyhole,
	MessageCircle,
	Rocket,
	Send,
	Shield,
	Users,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/chip";
import { BackToSettings } from "../../components/BackToSettings";

const resourceLinks = [
	{
		title: "Documentation",
		href: "https://freegrind.imaoreo.dev",
		description: "Reverse-engineered API notes and developer-facing reference.",
		icon: BookOpen,
		external: true,
	},
	{
		title: "Source Code",
		href: "https://github.com/kezza2k7/free-grind",
		description: "Track progress, inspect the code, and follow releases.",
		icon: GitBranch,
		external: true,
	},
	{
		title: "Contributing",
		href: "https://github.com/kezza2k7/free-grind/blob/main/CONTRIBUTING.md",
		description:
			"Project structure, contribution rules, and collaboration notes.",
		icon: HeartHandshake,
		external: true,
	},
	{
		title: "Licence",
		href: "https://github.com/kezza2k7/free-grind/blob/main/LICENSE",
		description: "Personal-use licence and attribution requirements.",
		icon: FileText,
		external: true,
	},
	{
		title: "Discord",
		href: "https://discord.gg/cJqTaWPMFF",
		description: "Join the community Discord server for support and discussion.",
		icon: MessageCircle,
		external: true,
	},
	{
		title: "Telegram",
		href: "https://t.me/freegrind",
		description: "Follow updates and announcements on Telegram.",
		icon: Send,
		external: true,
	},
];

export function AboutPage() {
	const appVersion = import.meta.env.VITE_APP_VERSION;

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-6xl gap-6">
				<header className="grid gap-4">
					<BackToSettings />

					<Card className="overflow-hidden p-0">
						<div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
							<div className="grid gap-5 p-6 sm:p-8">
								<div className="flex flex-wrap items-center gap-2">
									<Badge>About Free Grind</Badge>
									<span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
										v{appVersion}
									</span>
								</div>

								<div className="grid gap-3">
									<h1 className="app-title max-w-[14ch]">
										Free Grind is a privacy-first, community-built client.
									</h1>
									<p className="max-w-[68ch] text-sm leading-6 text-[var(--text-muted)] sm:text-base">
										Built for personal use with a cleaner interface, no ads, and
										open documentation around how things work. The goal is practical
										freedom, not platform lock-in.
									</p>
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											Platform
										</p>
										<p className="mt-1 text-base font-semibold">Tauri + React</p>
									</div>
									<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											Licence
										</p>
										<p className="mt-1 text-base font-semibold">Personal Use</p>
									</div>
								</div>
							</div>

							<div className="grid gap-4 border-t border-[var(--border)] bg-[var(--surface-2)] p-6 sm:p-8 lg:border-l lg:border-t-0">
								<div className="rounded-2xl bg-[var(--surface)] p-4">
									<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
										Maintainer
									</p>
									<p className="mt-2 text-lg font-semibold leading-snug">Jay Brammeld</p>
									<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
										Credit stays visible in-app to honor ownership and attribution.
									</p>
								</div>

								<div className="rounded-2xl bg-[var(--surface)] p-4">
									<div className="flex items-start gap-3">
										<div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-[var(--text)]">
											<Shield className="h-5 w-5" />
										</div>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											Commercial usage is reserved. Personal use, learning, and
											private experimentation are supported by the included licence.
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>
				</header>

				<div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
					<Card className="p-5 sm:p-6">
						<h2 className="text-lg font-semibold">Core Principles</h2>
						<div className="mt-4 grid gap-3">
							<div className="rounded-2xl bg-[var(--surface-2)] p-4">
								<div className="flex items-start gap-3">
									<LockKeyhole className="mt-0.5 h-4.5 w-4.5 text-[var(--text)]" />
									<div className="grid gap-1">
										<p className="text-sm font-semibold">Privacy over engagement tricks</p>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											The interface prioritizes control and clarity instead of ad-driven loops.
										</p>
									</div>
								</div>
							</div>
							<div className="rounded-2xl bg-[var(--surface-2)] p-4">
								<div className="flex items-start gap-3">
									<Users className="mt-0.5 h-4.5 w-4.5 text-[var(--text)]" />
									<div className="grid gap-1">
										<p className="text-sm font-semibold">Community-first documentation</p>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											Reverse-engineered notes stay public so users and contributors can learn together.
										</p>
									</div>
								</div>
							</div>
							<div className="rounded-2xl bg-[var(--surface-2)] p-4">
								<div className="flex items-start gap-3">
									<Rocket className="mt-0.5 h-4.5 w-4.5 text-[var(--text)]" />
									<div className="grid gap-1">
										<p className="text-sm font-semibold">Practical roadmap</p>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											Current focus includes browse, profile management, messaging foundations, and reliability.
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<Card className="p-5 sm:p-6">
						<h2 className="text-lg font-semibold">Support the project</h2>
						<div className="mt-4 grid gap-3 text-sm text-[var(--text-muted)]">
							<p>Donation links currently listed by the project team:</p>
							<a
								href="https://imaoreo.dev/donate"
								target="_blank"
								rel="noreferrer"
								className="rounded-2xl bg-[var(--surface-2)] px-4 py-3 font-medium text-[var(--text)] transition hover:bg-[color-mix(in_srgb,var(--surface-2)_70%,var(--accent)_30%)]"
							>
								imaoreo.dev/donate
							</a>
							<a
								href="https://hloth.dev/donate"
								target="_blank"
								rel="noreferrer"
								className="rounded-2xl bg-[var(--surface-2)] px-4 py-3 font-medium text-[var(--text)] transition hover:bg-[color-mix(in_srgb,var(--surface-2)_70%,var(--accent)_30%)]"
							>
								hloth.dev/donate
							</a>
						</div>
					</Card>
				</div>

				<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
