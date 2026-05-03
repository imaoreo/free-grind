import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "./useApi";
import { createApiFunctions } from "../services/apiFunctions";

export function useApiFunctions() {
	const { fetchRest } = useApi();
	const { t } = useTranslation();
	return useMemo(() => createApiFunctions(fetchRest, t), [fetchRest, t]);
}
