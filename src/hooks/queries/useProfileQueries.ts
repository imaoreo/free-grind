import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import type { TravelPlanPayload } from "../../types/travel";
import { findConversationByProfileId } from "../../services/chatDb";
import { markSelfBlockAction } from "../../utils/selfBlockActions";
import {
	applySelfBlockAction,
	markConversationDeleteHandled,
} from "../../services/conversationArchive";

// chat.v1.conversation.delete fires identically for "we blocked/unblocked
// them" and "they blocked/unblocked us" — mark the conversation right after
// our own block/unblock call succeeds so that event can tell the two apart.
//
// Also claim the WS-echo dedup lock (markConversationDeleteHandled) here,
// not just in applySelfBlockAction's onSuccess — that's a purely local DB
// read with no network round trip, so it's guaranteed to land before the
// chat.v1.conversation.delete event even *could* arrive (which needs the
// outgoing request to reach the server and a broadcast to come back).
// Claiming it only in applySelfBlockAction (after the mutation's own HTTP
// round trip) left a real window where the WS-triggered path could win the
// race, archive, and insert its own system message before
// applySelfBlockAction's local state check could see it — producing a
// duplicate "You blocked/unblocked this person".
function markConversationSelfAction(profileId: string, action: "block" | "unblock") {
	void findConversationByProfileId(profileId)
		.then((conversation) => {
			if (conversation) {
				markSelfBlockAction(conversation.conversationId, action);
				markConversationDeleteHandled(conversation.conversationId);
			}
		})
		.catch(() => {});
}

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
		// Mark before the request goes out, not in onSuccess — the resulting
		// chat.v1.conversation.delete WS event can otherwise race ahead of an
		// onSuccess-time mark and land unattributed as "You were blocked".
		onMutate: (profileId) => {
			markConversationSelfAction(profileId, "block");
		},
		onSuccess: (_, profileId) => {
			// Manually update the cache for blocked IDs to keep UI in sync
			queryClient.setQueryData<string[]>(["blocked-profile-ids"], (old) => {
				if (!old) return [profileId];
				if (old.includes(profileId)) return old;
				return [...old, profileId];
			});
			// Archive any existing conversation with this profile right away
			// instead of waiting on the WS round-trip — covers every entry
			// point (grid, profile page, chat header), not just chat.
			void applySelfBlockAction(profileId, "block");
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
		onMutate: (profileId) => {
			markConversationSelfAction(profileId, "unblock");
		},
		onSuccess: (_, profileId) => {
			// Manually update the cache for blocked IDs to keep UI in sync
			queryClient.setQueryData<string[]>(["blocked-profile-ids"], (old) => {
				if (!old) return [];
				return old.filter((id) => id !== profileId);
			});
			// Take any existing conversation with this profile out of archive
			// right away — covers every entry point (blocked-list settings,
			// grid, profile page, chat header), not just chat.
			void applySelfBlockAction(profileId, "unblock");
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
