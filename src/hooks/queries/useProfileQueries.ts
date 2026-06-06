import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";

import { type BlockedProfile } from "../../services/api/profileMethods";

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
 * Hook to fetch and manage full blocked profile details.
 */
export function useBlockedProfiles() {
	const api = useApiFunctions();
	return useQuery({
		queryKey: ["blocked-profiles"],
		queryFn: () => api.getBlockedProfiles(),
		staleTime: 1000 * 60 * 10,
	});
}

/**
 * Mutation to block a profile.
 * Automatically updates the cache.
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
			// Invalidate the full profiles query so it refetches the list from the server
			queryClient.invalidateQueries({ queryKey: ["blocked-profiles"] });
		},
	});
}

/**
 * Mutation to unblock a profile.
 * Automatically updates the cache.
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
			// Manually remove from the blocked profiles list to reflect instantly in the UI
			queryClient.setQueryData<BlockedProfile[]>(["blocked-profiles"], (old) => {
				if (!old) return [];
				return old.filter((p) => p.profileId !== profileId);
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
