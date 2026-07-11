import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/useAuth";
import {
	useManagedGenders,
	useManagedPronouns,
	useManagedTagCategories,
} from "../hooks/queries/useProfileQueries";

/**
 * Bridge component that warms the managed genders/pronouns/tags catalogs
 * (React Query cache, staleTime: Infinity) once a session is active, so the
 * profile editor, the grid profile page, and the grid filters don't each pay
 * for the first fetch.
 */
export function ManagedOptionsCacheBridge() {
	const { i18n } = useTranslation();
	const { userId, isLoading: isAuthLoading } = useAuth();
	const enabled = Boolean(userId) && !isAuthLoading;

	useManagedGenders(enabled);
	useManagedPronouns(enabled);
	useManagedTagCategories(i18n.language, enabled);

	return null;
}
