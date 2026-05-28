import { History, Eye, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OnboardingModal, OnboardingItem } from "../../../components/OnboardingModal";

export function InterestOnboardingModal({
	onClose,
	onConfirm,
}: {
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<OnboardingModal
			title={t("interest_page.onboarding.title", "Profile Visitors")}
			onClose={onClose}
			onConfirm={onConfirm}
			headerIcon={Eye}
			buttonLabel={t("interest_page.onboarding.button", "Got it!")}
		>
			<OnboardingItem
				icon={Info}
				title={t("interest_page.onboarding.limitation_title", "How it works")}
				description={t("interest_page.onboarding.limitation_desc", "Grindr normally only shows the very last visitor in full. Others are typically hidden behind a paywall or shown as anonymous previews.")}
			/>

			<OnboardingItem
				icon={History}
				title={t("interest_page.onboarding.recovery_title", "Smart Recovery")}
				description={t("interest_page.onboarding.recovery_desc", "Free Grind automatically matches anonymous previews with your local history. If we find a match, we reveal the profile for you.")}
			>
				<div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 border border-[var(--border)]">
					<History className="h-4 w-4 text-[var(--accent)]" />
					<span className="text-xs font-medium text-[var(--text-muted)] italic">
						{t("interest_page.recovered_tooltip", "Identified from local history")}
					</span>
				</div>
			</OnboardingItem>
		</OnboardingModal>
	);
}
