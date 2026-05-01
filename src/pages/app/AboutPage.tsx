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
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/chip";
import { BackToSettings } from "../../components/BackToSettings";

export function AboutPage() {
	const { t } = useTranslation();
	const appVersion = import.meta.env.VITE_APP_VERSION;

	const resourceLinks = useMemo(
		() => [
			{
				title: t("about_page.resources.documentation_title"),
				href: "https://freegrind.imaoreo.dev",
				description: t("about_page.resources.documentation_desc"),
				icon: BookOpen,
				external: true,
			},
			{
				title: t("about_page.resources.source_code_title"),
				href: "https://github.com/kezza2k7/free-grind",
				description: t("about_page.resources.source_code_desc"),
				icon: GitBranch,
				external: true,
			},
			{
				title: t("about_page.resources.contributing_title"),
				href: "https://github.com/kezza2k7/free-grind/blob/main/CONTRIBUTING.md",
				description: t("about_page.resources.contributing_desc"),
				icon: HeartHandshake,
				external: true,
			},
			{
				title: t("about_page.resources.licence_title"),
				href: "https://github.com/kezza2k7/free-grind/blob/main/LICENSE",
				description: t("about_page.resources.licence_desc"),
				icon: FileText,
				external: true,
			},
			{
				title: t("about_page.resources.discord_title"),
				href: "https://discord.gg/cJqTaWPMFF",
				description: t("about_page.resources.discord_desc"),
				icon: MessageCircle,
				external: true,
			},
			{
				title: t("about_page.resources.telegram_title"),
				href: "https://t.me/freegrind",
				description: t("about_page.resources.telegram_desc"),
				icon: Send,
				external: true,
			},
		],
		[t],
	);

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-6xl gap-6">
				<header className="grid gap-4">
					<BackToSettings />

					<Card className="overflow-hidden p-0">
						<div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
							<div className="grid gap-5 p-6 sm:p-8">
								<div className="flex flex-wrap items-center gap-2">
									<Badge>{t("about_page.badge")}</Badge>
									<span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
										v{appVersion}
									</span>
								</div>

								<div className="grid gap-3">
									<h1 className="app-title max-w-[14ch]">
										{t("about_page.title")}
									</h1>
									<p className="max-w-[68ch] text-sm leading-6 text-[var(--text-muted)] sm:text-base">
										{t("about_page.description")}
									</p>
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											{t("about_page.platform")}
										</p>
										<p className="mt-1 text-base font-semibold">Tauri + React</p>
									</div>
									<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
											{t("about_page.licence")}
										</p>
										<p className="mt-1 text-base font-semibold">
											{t("about_page.licence_value")}
										</p>
									</div>
								</div>
							</div>

							<div className="grid gap-4 border-t border-[var(--border)] bg-[var(--surface-2)] p-6 sm:p-8 lg:border-l lg:border-t-0">
								<div className="rounded-2xl bg-[var(--surface)] p-4">
									<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
										{t("about_page.maintainer")}
									</p>
									<p className="mt-2 text-lg font-semibold leading-snug">
										Jay Brammeld
									</p>
									<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
										{t("about_page.maintainer_credit")}
									</p>
								</div>

								<div className="rounded-2xl bg-[var(--surface)] p-4">
									<div className="flex items-start gap-3">
										<div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-[var(--text)]">
											<Shield className="h-5 w-5" />
										</div>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											{t("about_page.commercial_note")}
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>
				</header>

				<div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
					<Card className="p-5 sm:p-6">
						<h2 className="text-lg font-semibold">
							{t("about_page.principles_title")}
						</h2>
						<div className="mt-4 grid gap-3">
							<div className="rounded-2xl bg-[var(--surface-2)] p-4">
								<div className="flex items-start gap-3">
									<LockKeyhole className="mt-0.5 h-4.5 w-4.5 text-[var(--text)]" />
									<div className="grid gap-1">
										<p className="text-sm font-semibold">
											{t("about_page.principles.privacy_title")}
										</p>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											{t("about_page.principles.privacy_desc")}
										</p>
									</div>
								</div>
							</div>
							<div className="rounded-2xl bg-[var(--surface-2)] p-4">
								<div className="flex items-start gap-3">
									<Users className="mt-0.5 h-4.5 w-4.5 text-[var(--text)]" />
									<div className="grid gap-1">
										<p className="text-sm font-semibold">
											{t("about_page.principles.community_title")}
										</p>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											{t("about_page.principles.community_desc")}
										</p>
									</div>
								</div>
							</div>
							<div className="rounded-2xl bg-[var(--surface-2)] p-4">
								<div className="flex items-start gap-3">
									<Rocket className="mt-0.5 h-4.5 w-4.5 text-[var(--text)]" />
									<div className="grid gap-1">
										<p className="text-sm font-semibold">
											{t("about_page.principles.roadmap_title")}
										</p>
										<p className="text-sm leading-6 text-[var(--text-muted)]">
											{t("about_page.principles.roadmap_desc")}
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<Card className="p-5 sm:p-6">
						<h2 className="text-lg font-semibold">
							{t("about_page.support_title")}
						</h2>
						<div className="mt-4 grid gap-3 text-sm text-[var(--text-muted)]">
							<p>{t("about_page.support_text")}</p>
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
										{resource.external
											? t("about_page.resources.external")
											: t("about_page.resources.local")}
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
