/**
 * selfBlockActions.ts — disambiguates who triggered a block/unblock.
 *
 * chat.v1.conversation.delete (and its offline-fallback equivalents, see
 * conversationArchive.ts) fires identically whether we blocked/unblocked
 * someone or they did it to us. The only local signal we have is timing:
 * mark a conversation right after *we* call the block/unblock API, then
 * check that mark when the resulting event lands.
 */

export type SelfBlockAction = "block" | "unblock";

const TTL_MS = 60_000;

const pending = new Map<string, { action: SelfBlockAction; expiresAt: number }>();

export function markSelfBlockAction(conversationId: string, action: SelfBlockAction): void {
	pending.set(conversationId, { action, expiresAt: Date.now() + TTL_MS });
}

/**
 * Returns true (and clears the mark) if the given conversation has a recent,
 * still-valid self-triggered action matching `expectedAction`.
 */
export function consumeSelfBlockAction(
	conversationId: string,
	expectedAction: SelfBlockAction,
): boolean {
	const entry = pending.get(conversationId);
	if (!entry) return false;
	pending.delete(conversationId);
	return entry.expiresAt >= Date.now() && entry.action === expectedAction;
}
