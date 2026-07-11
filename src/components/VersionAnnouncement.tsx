import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { VersionAnnouncement as VersionAnnouncementData } from "../data/versionAnnouncements";
import logo from "../images/freegrind-logo.webp";

function Dots({ total, current }: { total: number; current: number }) {
	if (total <= 1) {
		return null;
	}

	return (
		<div
			className="flex justify-center pb-3 pt-5"
			style={{ paddingTop: "max(36px, env(safe-area-inset-top))" }}
		>
			<div className="flex items-center justify-center gap-2">
				{Array.from({ length: total }).map((_, i) => (
					<div
						key={i}
						className="h-1.5 rounded-full transition-all duration-300"
						style={{
							width: i === current ? "24px" : "6px",
							background: i <= current ? "var(--accent)" : "var(--border)",
						}}
					/>
				))}
			</div>
		</div>
	);
}

export function VersionAnnouncement({
	announcement,
	onClose,
	buttonLabel = "Got it",
}: {
	announcement: VersionAnnouncementData;
	onClose: () => void;
	buttonLabel?: string;
}) {
	// -1 = intro page (headline/version), 0..items.length-1 = one item per page
	const [step, setStep] = useState(-1);

	const items = announcement.items;
	const isIntro = step === -1;
	const isLastItem = step === items.length - 1;
	const item = isIntro ? null : items[step];

	const handleAdvance = () => {
		if (isIntro) {
			if (items.length > 0) {
				setStep(0);
			} else {
				onClose();
			}
			return;
		}
		if (isLastItem) {
			onClose();
			return;
		}
		setStep((s) => s + 1);
	};

	const isFinalPage = isIntro ? items.length === 0 : isLastItem;
	const Icon = item?.icon;

	return (
		<div className="fs-card-outer fs-card-overlay z-[300] no-touch-callout">
			<div className="fs-card-inner fs-card-lg flex flex-col">
				{!isIntro && <Dots total={items.length} current={step} />}

				{isIntro ? (
					<div
						className="flex flex-1 flex-col items-center justify-center px-8 text-center"
						style={{
							paddingTop: "max(48px, env(safe-area-inset-top))",
							paddingBottom: "max(48px, calc(env(safe-area-inset-bottom) + 80px))",
						}}
					>
						<img src={logo} alt="" className="mb-6 h-16 w-16 rounded-2xl object-cover" />
						<h1 className="text-2xl font-bold text-[var(--text)]">{announcement.headline}</h1>
						<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
							Version {announcement.version}
						</p>
					</div>
				) : (
					<div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
						<div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
							{Icon && <Icon className="h-9 w-9 text-[var(--accent)]" />}
						</div>
						<h2 className="text-xl font-bold text-[var(--text)]">{item?.title}</h2>
						<div className="flex h-24 flex-col items-center overflow-hidden">
							<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
								{item?.description}
							</p>
						</div>
					</div>
				)}

				<div
					className="flex h-44 shrink-0 flex-col justify-end gap-2 px-6"
					style={{ paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 12px))" }}
				>
					<button
						type="button"
						onClick={handleAdvance}
						className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						{!isIntro && isLastItem ? buttonLabel : "Continue"}
						<ChevronRight className="h-4 w-4" />
					</button>
					{!isFinalPage && (
						<button
							type="button"
							onClick={onClose}
							className="w-full rounded-xl py-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
						>
							Skip
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
