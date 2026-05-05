import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Fingerprint, ScanFace, ShieldCheck } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { LoadingState, ErrorState } from "../../components/ui/states";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useTranslation } from "react-i18next";
import type {
	AgeVerificationFaceTecResponse,
	AgeVerificationOptions,
	VerificationStep,
} from "../../types/age-verification";

/**
 * Builds the FaceTec user agent string per the API specification.
 * Format: facetec|sdk|android|{version}|{appId}|{deviceModel}|{sdkVersion}|{locale}|{language}|{extraParam}
 */
function buildFaceTecUserAgent(sdkVersion: string): string {
	const locale = navigator.language || "en-US";
	const language = locale.split("-")[0] ?? "en";
	return `facetec|sdk|web|3.0.0|com.grindrapp.web|browser|${sdkVersion}|${locale}|${language}|3.0.0`;
}

export function AgeVerificationPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const {
		getAgeVerificationOptions,
		createAgeVerificationSession,
		verifyAgeLiveness3d,
		verifyAgeEnrollment,
	} = useApiFunctions();

	const [step, setStep] = useState<VerificationStep>("loading-options");
	const [options, setOptions] = useState<AgeVerificationOptions | null>(null);
	const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [result, setResult] = useState<AgeVerificationFaceTecResponse | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const methodLabels: Record<
		string,
		{ label: string; description: string; icon: React.ReactNode }
	> = {
		liveness3d: {
			label: t("age_verification.methods.liveness3d.label"),
			description: t("age_verification.methods.liveness3d.description"),
			icon: <ScanFace className="h-5 w-5" />,
		},
		enrollment: {
			label: t("age_verification.methods.enrollment.label"),
			description: t("age_verification.methods.enrollment.description"),
			icon: <Fingerprint className="h-5 w-5" />,
		},
		document: {
			label: t("age_verification.methods.document.label"),
			description: t("age_verification.methods.document.description"),
			icon: <ShieldCheck className="h-5 w-5" />,
		},
	};

	const loadOptions = useCallback(async () => {
		setStep("loading-options");
		setErrorMessage(null);
		try {
			const opts = await getAgeVerificationOptions();
			setOptions(opts);
			setStep("select-method");
		} catch (err) {
			setErrorMessage(
				err instanceof Error
					? err.message
					: t("age_verification.errors.load_options"),
			);
			setStep("error");
		}
	}, [getAgeVerificationOptions, t]);

	useEffect(() => {
		void loadOptions();
	}, [loadOptions]);

	async function handleSelectMethod(method: string) {
		setSelectedMethod(method);
		setStep("starting-session");
		try {
			const session = await createAgeVerificationSession();
			setSessionId(session.sessionId);
			setStep("face-scan");
		} catch (err) {
			setErrorMessage(
				err instanceof Error
					? err.message
					: t("age_verification.errors.start_session"),
			);
			setStep("error");
		}
	}

	async function handleStartFaceScan() {
		if (!selectedMethod || !sessionId || !options) return;
		setStep("submitting");
		try {
			let res: AgeVerificationFaceTecResponse;

			if (selectedMethod === "liveness3d") {
				// FaceTec Web SDK integration point.
				// In production, call FaceTecSDK.initialize() with options.faceTecConfig,
				// run a session, then pass the blobs below.
				// See: https://dev.facetec.com/
				const userAgent = buildFaceTecUserAgent("3.0.0");
				res = await verifyAgeLiveness3d({
					faceTecUserAgent: userAgent,
					// These would come from a real FaceTec SDK session:
					faceScan: "",
					auditTrailImage: "",
					lowQualityAuditTrailImage: "",
				});
			} else {
				res = await verifyAgeEnrollment();
			}

			setResult(res);
			setStep("success");
		} catch (err) {
			setErrorMessage(
				err instanceof Error
					? err.message
					: t("age_verification.errors.verification_failed"),
			);
			setStep("error");
		}
	}

	const availableMethods = options?.methods ?? [];

	return (
		<section className="app-screen">
			<header className="mb-6">
				<BackToSettings />
				<h1 className="app-title">{t("age_verification.title")}</h1>
				<p className="app-subtitle">{t("age_verification.subtitle")}</p>
			</header>

			<div className="grid gap-4">
				{step === "loading-options" && (
					<LoadingState title={t("age_verification.loading_options")} />
				)}

				{step === "error" && (
					<ErrorState
						title={t("age_verification.unavailable")}
						description={errorMessage ?? undefined}
						onRetry={() => void loadOptions()}
					/>
				)}

				{step === "select-method" && (
					<>
						{availableMethods.length === 0 ? (
							<Card className="p-5 sm:p-6">
								<p className="text-sm text-[var(--text-muted)]">
									{t("age_verification.no_methods")}
								</p>
							</Card>
						) : (
							availableMethods.map((method) => {
								const meta = methodLabels[method] ?? {
									label: method,
									description: t("age_verification.methods.default_description"),
									icon: <ShieldCheck className="h-5 w-5" />,
								};
								return (
									<button
										key={method}
										type="button"
										onClick={() => void handleSelectMethod(method)}
										className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
									>
										<div className="flex items-center gap-3">
											<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
												{meta.icon}
											</div>
											<div>
												<p className="text-base font-semibold">{meta.label}</p>
												<p className="text-sm text-[var(--text-muted)]">
													{meta.description}
												</p>
											</div>
										</div>
									</button>
								);
							})
						)}
					</>
				)}

				{step === "starting-session" && (
					<LoadingState title={t("age_verification.starting_session")} />
				)}

				{step === "face-scan" && selectedMethod && (
					<Card className="p-5 sm:p-6">
						<div className="mb-4 flex items-center gap-3">
							<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
								<ScanFace className="h-5 w-5" />
							</div>
							<div>
								<p className="text-base font-semibold">
									{methodLabels[selectedMethod]?.label ?? selectedMethod}
								</p>
								<p className="text-sm text-[var(--text-muted)]">
									{t("age_verification.session_ready")}
								</p>
							</div>
						</div>

						<p className="mb-1 text-sm text-[var(--text-muted)]">
							{t("age_verification.session_id")}: {" "}
							<span className="font-mono text-xs break-all">{sessionId}</span>
						</p>

						<p className="mb-5 text-sm text-[var(--text-muted)]">
							{selectedMethod === "liveness3d" || selectedMethod === "enrollment"
								? t("age_verification.camera_guidance")
								: t("age_verification.generic_guidance")}
						</p>

						<div className="flex gap-3">
							<Button
								variant="primary"
								size="md"
								leftIcon={<ScanFace className="h-4 w-4" />}
								onClick={() => void handleStartFaceScan()}
								className="flex-1"
							>
								{t("age_verification.start_scan")}
							</Button>
							<Button
								variant="ghost"
								size="md"
								onClick={() => setStep("select-method")}
							>
								{t("age_verification.cancel")}
							</Button>
						</div>
					</Card>
				)}

				{step === "submitting" && (
					<LoadingState
						title={t("age_verification.submitting")}
						description={t("age_verification.submitting_description")}
					/>
				)}

				{step === "success" && result && (
					<Card className="p-5 sm:p-6">
						<div className="flex items-center gap-3 mb-4">
							<CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
							<div>
								<p className="text-base font-semibold">
									{t("age_verification.submitted")}
								</p>
								<p className="text-sm text-[var(--text-muted)]">
									{t("age_verification.status")}: {" "}
									<span className="font-mono">{result.status}</span>
								</p>
							</div>
						</div>
						<p className="text-sm text-[var(--text-muted)] mb-5">
							{t("age_verification.submitted_description")}
						</p>
						<Button
							variant="secondary"
							size="md"
							onClick={() => navigate("/settings")}
							className="w-full"
						>
							{t("age_verification.back_to_settings")}
						</Button>
					</Card>
				)}

				{step === "success" && !result && (
					<Card className="p-5 sm:p-6">
						<div className="flex items-center gap-3 mb-4">
							<CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
							<p className="text-base font-semibold">
								{t("age_verification.complete")}
							</p>
						</div>
						<Button
							variant="secondary"
							size="md"
							onClick={() => navigate("/settings")}
							className="w-full"
						>
							{t("age_verification.back_to_settings")}
						</Button>
					</Card>
				)}
			</div>
		</section>
	);
}
