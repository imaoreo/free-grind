import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Fingerprint, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { LoadingState, ErrorState } from "../../components/ui/states";
import { useAgeVerificationService } from "../../services/ageVerification";
import type {
	AgeVerificationFaceTecResponse,
	AgeVerificationOptions,
	VerificationStep,
} from "../../types/age-verification";

const METHOD_LABELS: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
	liveness3d: {
		label: "Face Liveness Check",
		description: "Use your camera to verify your age with a 3D face scan.",
		icon: <ScanFace className="h-5 w-5" />,
	},
	enrollment: {
		label: "Face Enrollment",
		description: "Enroll your face biometrics for age verification.",
		icon: <Fingerprint className="h-5 w-5" />,
	},
	document: {
		label: "Photo ID",
		description: "Verify your age by submitting a government-issued photo ID.",
		icon: <ShieldCheck className="h-5 w-5" />,
	},
};

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
	const navigate = useNavigate();
	const { getOptions, createSession, verifyLiveness3d, verifyEnrollment } =
		useAgeVerificationService();

	const [step, setStep] = useState<VerificationStep>("loading-options");
	const [options, setOptions] = useState<AgeVerificationOptions | null>(null);
	const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [result, setResult] = useState<AgeVerificationFaceTecResponse | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const loadOptions = useCallback(async () => {
		setStep("loading-options");
		setErrorMessage(null);
		try {
			const opts = await getOptions();
			setOptions(opts);
			setStep("select-method");
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "Failed to load verification options.");
			setStep("error");
		}
	}, [getOptions]);

	useEffect(() => {
		void loadOptions();
	}, [loadOptions]);

	async function handleSelectMethod(method: string) {
		setSelectedMethod(method);
		setStep("starting-session");
		try {
			const session = await createSession();
			setSessionId(session.sessionId);
			setStep("face-scan");
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "Failed to start verification session.");
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
				res = await verifyLiveness3d({
					faceTecUserAgent: userAgent,
					// These would come from a real FaceTec SDK session:
					faceScan: "",
					auditTrailImage: "",
					lowQualityAuditTrailImage: "",
				});
			} else {
				res = await verifyEnrollment();
			}

			setResult(res);
			setStep("success");
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "Verification failed. Please try again.");
			setStep("error");
		}
	}

	const availableMethods = options?.methods ?? [];

	return (
		<section className="app-screen">
			<header className="mb-6 flex items-center gap-3">
				<button
					type="button"
					onClick={() => navigate("/settings")}
					className="rounded-xl p-2 hover:bg-[var(--surface-2)] transition-colors"
					aria-label="Back to settings"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>
				<div>
					<h1 className="app-title">Age Verification</h1>
					<p className="app-subtitle">Confirm your age to access all features.</p>
				</div>
			</header>

			<div className="grid gap-4">
				{step === "loading-options" && (
					<LoadingState title="Loading verification options…" />
				)}

				{step === "error" && (
					<ErrorState
						title="Verification unavailable"
						description={errorMessage ?? undefined}
						onRetry={() => void loadOptions()}
					/>
				)}

				{step === "select-method" && (
					<>
						{availableMethods.length === 0 ? (
							<Card className="p-5 sm:p-6">
								<p className="text-sm text-[var(--text-muted)]">
									No verification methods are currently available. Please try again later.
								</p>
							</Card>
						) : (
							availableMethods.map((method) => {
								const meta = METHOD_LABELS[method] ?? {
									label: method,
									description: "Verify your age using this method.",
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
					<LoadingState title="Starting verification session…" />
				)}

				{step === "face-scan" && selectedMethod && (
					<Card className="p-5 sm:p-6">
						<div className="mb-4 flex items-center gap-3">
							<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
								<ScanFace className="h-5 w-5" />
							</div>
							<div>
								<p className="text-base font-semibold">
									{METHOD_LABELS[selectedMethod]?.label ?? selectedMethod}
								</p>
								<p className="text-sm text-[var(--text-muted)]">Session ready</p>
							</div>
						</div>

						<p className="mb-1 text-sm text-[var(--text-muted)]">
							Session ID:{" "}
							<span className="font-mono text-xs break-all">{sessionId}</span>
						</p>

						<p className="mb-5 text-sm text-[var(--text-muted)]">
							{selectedMethod === "liveness3d" || selectedMethod === "enrollment"
								? "Your camera will be used to perform a 3D liveness check. Make sure you're in a well-lit environment."
								: "Follow the on-screen steps to complete your verification."}
						</p>

						<div className="flex gap-3">
							<Button
								variant="primary"
								size="md"
								leftIcon={<ScanFace className="h-4 w-4" />}
								onClick={() => void handleStartFaceScan()}
								className="flex-1"
							>
								Start Scan
							</Button>
							<Button
								variant="ghost"
								size="md"
								onClick={() => setStep("select-method")}
							>
								Cancel
							</Button>
						</div>
					</Card>
				)}

				{step === "submitting" && (
					<LoadingState title="Submitting verification…" description="Please wait while your identity is being verified." />
				)}

				{step === "success" && result && (
					<Card className="p-5 sm:p-6">
						<div className="flex items-center gap-3 mb-4">
							<CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
							<div>
								<p className="text-base font-semibold">Verification submitted</p>
								<p className="text-sm text-[var(--text-muted)]">
									Status: <span className="font-mono">{result.status}</span>
								</p>
							</div>
						</div>
						<p className="text-sm text-[var(--text-muted)] mb-5">
							Your age verification request has been submitted successfully. It may take a moment to process.
						</p>
						<Button
							variant="secondary"
							size="md"
							onClick={() => navigate("/settings")}
							className="w-full"
						>
							Back to Settings
						</Button>
					</Card>
				)}

				{step === "success" && !result && (
					<Card className="p-5 sm:p-6">
						<div className="flex items-center gap-3 mb-4">
							<CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
							<p className="text-base font-semibold">Verification complete</p>
						</div>
						<Button
							variant="secondary"
							size="md"
							onClick={() => navigate("/settings")}
							className="w-full"
						>
							Back to Settings
						</Button>
					</Card>
				)}
			</div>
		</section>
	);
}
