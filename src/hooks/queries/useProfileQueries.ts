import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import type { TravelPlanPayload } from "../../types/travel";

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

/**
 * Hook to fetch a profile's travel plans.
 */
export function useTravelPlans(profileId: string | number | null | undefined) {
	const api = useApiFunctions();
	return useQuery({
		queryKey: ["travel-plans", profileId == null ? null : String(profileId)],
		queryFn: () => api.getTravelPlans(profileId!),
		enabled: profileId != null,
		staleTime: 1000 * 60 * 5,
	});
}

function invalidateTravelPlans(queryClient: ReturnType<typeof useQueryClient>, profileId: number) {
	void queryClient.invalidateQueries({ queryKey: ["travel-plans", String(profileId)] });
}

/**
 * Mutation to create a travel plan. Invalidates that profile's travel-plans cache on success.
 */
export function useCreateTravelPlan() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: TravelPlanPayload) => api.createTravelPlan(payload),
		onSuccess: (_, payload) => invalidateTravelPlans(queryClient, payload.profileId),
	});
}

/**
 * Mutation to update a travel plan. Invalidates that profile's travel-plans cache on success.
 */
export function useUpdateTravelPlan() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: TravelPlanPayload & { travelPlanId: number }) => api.updateTravelPlan(payload),
		onSuccess: (_, payload) => invalidateTravelPlans(queryClient, payload.profileId),
	});
}

/**
 * Mutation to delete a travel plan. Invalidates that profile's travel-plans cache on success.
 */
export function useDeleteTravelPlan() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ travelPlanId }: { travelPlanId: number; profileId: number }) =>
			api.deleteTravelPlan(travelPlanId),
		onSuccess: (_, variables) => invalidateTravelPlans(queryClient, variables.profileId),
	});
}
