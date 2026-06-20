import { useEffect } from "react";
import { useAuth } from "../contexts/useAuth";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { runBlockedMeDetection } from "../services/blockDetection";
import { appLog } from "../utils/logger";

const CHECK_INTERVAL_MS = 3 * 60_000;


 // runs blockedme detection appwide on a timer
export function BlockedMeBridge() {
	const { userId, isLoading: isAuthLoading } = useAuth();
	const service = useApiFunctions();

	useEffect(() => {
		if (isAuthLoading || userId == null) return;

		const check = async () => {
			try {
				const response = await service.listConversations({ page: 1 });
				await runBlockedMeDetection(service, response.entries, userId, true);
			} catch (error) {
				appLog.warn("[BlockedMeBridge] check failed", error);
			}
		};

		void check();
		const intervalId = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [isAuthLoading, userId, service]);

	return null;
}
