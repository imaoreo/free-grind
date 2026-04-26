import { useMemo } from "react";
import { useApi } from "./useApi";
import { createApiFunctions } from "../services/apiFunctions";

export function useApiFunctions() {
	const { fetchRest } = useApi();
	return useMemo(() => createApiFunctions(fetchRest), [fetchRest]);
}
