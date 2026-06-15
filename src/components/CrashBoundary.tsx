import { Component, type ErrorInfo, type ReactNode } from "react";
import { showCrashOverlay } from "../utils/crashOverlay";

type CrashBoundaryProps = {
	children: ReactNode;
};

type CrashBoundaryState = {
	hasError: boolean;
	message: string;
	detail?: string;
};

/**
 * Catches React render errors that would otherwise destroy the whole tree
 * (showing as a black screen) and displays them on screen instead, tbh this is kinda dumb but idk i was bored
 */
export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
	state: CrashBoundaryState = { hasError: false, message: "" };

	static getDerivedStateFromError(error: Error): CrashBoundaryState {
		return {
			hasError: true,
			message: error.message,
			detail: error.stack,
		};
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		showCrashOverlay(`React render error: ${error.message}`, `${error.stack}\n\n${info.componentStack}`);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "#140000",
						color: "#fff",
						fontFamily: "monospace",
						fontSize: "12px",
						lineHeight: 1.4,
						padding: "calc(env(safe-area-inset-top, 0px) + 16px) 12px 16px 12px",
						overflow: "auto",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						zIndex: 2147483647,
					}}
				>
					<div style={{ fontWeight: "bold", color: "#ff6b6b" }}>
						React render error: {this.state.message}
					</div>
					{this.state.detail && (
						<div style={{ marginTop: 8, opacity: 0.85 }}>{this.state.detail}</div>
					)}
				</div>
			);
		}

		return this.props.children;
	}
}
