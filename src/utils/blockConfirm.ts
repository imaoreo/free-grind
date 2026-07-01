// Shared by GridPage, GridProfilePage, ChatThreadPanel (read before blocking/
// unblocking) and CustomizabilityPage (the direct settings toggle) so they
// all agree on the same localStorage keys. App-wide, not per profile.
export const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";
export const SKIP_UNBLOCK_CONFIRM_KEY = "profile_skip_unblock_confirm";
