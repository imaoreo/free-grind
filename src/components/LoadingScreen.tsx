import logo from "../images/freegrind-logo.webp";

export function LoadingScreen() {
	return (
		<div
			className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-6 bg-[var(--bg)]"
			style={{
				paddingTop: "env(safe-area-inset-top)",
				paddingBottom: "env(safe-area-inset-bottom)",
			}}
		>
			<div className="relative flex h-24 w-24 items-center justify-center">
				<div className="absolute inset-0 rounded-full bg-[var(--surface-2)] shadow-inner" />
				<div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)] border-r-[var(--accent)]/40" />
				<img
					src={logo}
					alt="Free Grind"
					className="relative h-14 w-14 rounded-2xl object-contain"
					draggable={false}
				/>
			</div>
			<p className="text-sm font-semibold tracking-wide text-[var(--text-muted)]">
				Free Grind
			</p>
		</div>
	);
}
