import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";

/**
 * Hook to fetch and manage blocked profile IDs.
 */
export function useBlockedProfileIds() {
	const api = useApiFunctions();
	return useQuery({
		queryKey: ["blocked-profile-ids"],
		queryFn: () => api.getBlockedProfileIds(),
		staleTime: 1000 * 60 * 10, // Consider data fresh for 10 minutes
	});
}

/**
 * Mutation to block a profile.
 * Automatically updates the "blocked-profile-ids" cache.
 */
export function useBlockProfile() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (profileId: string) => api.blockProfile(profileId),
		onSuccess: (_, profileId) => {
			// Manually update the cache for blocked IDs to keep UI in sync
			queryClient.setQueryData<string[]>(["blocked-profile-ids"], (old) => {
				if (!old) return [profileId];
				if (old.includes(profileId)) return old;
				return [...old, profileId];
			});
		},
	});
}

/**
 * Mutation to unblock a profile.
 * Automatically updates the "blocked-profile-ids" cache.
 */
export function useUnblockProfile() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (profileId: string) => api.unblockProfile(profileId),
		onSuccess: (_, profileId) => {
			// Manually update the cache for blocked IDs to keep UI in sync
			queryClient.setQueryData<string[]>(["blocked-profile-ids"], (old) => {
				if (!old) return [];
				return old.filter((id) => id !== profileId);
			});
		},
	});
}

/**
 * Hook to fetch managed genders.
 */
export function useManagedGenders() {
	const api = useApiFunctions();
	return useQuery({
		queryKey: ["managed-genders"],
		queryFn: () => api.getManagedGenders(),
		staleTime: Infinity, // These rarely change
	});
}

/**
 * Hook to fetch managed pronouns.
 */
export function useManagedPronouns() {
	const api = useApiFunctions();
	return useQuery({
		queryKey: ["managed-pronouns"],
		queryFn: () => api.getManagedPronouns(),
		staleTime: Infinity, // These rarely change
	});
}
