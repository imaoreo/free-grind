/**
 * Shared limiter for chatDb reads that return base64 media/avatar bytes
 * (mediaStore.ts and avatarStore.ts both funnel through this one instance,
 * since the actual constraint — the Android WebView's main-thread IPC
 * bridge — is shared across both, not per-module). See concurrencyLimit.ts
 * for why this exists.
 */

import { createLimiter } from "./concurrencyLimit";

const CHAT_DB_BLOB_READ_CONCURRENCY = 6;

export const limitChatDbBlobRead = createLimiter(CHAT_DB_BLOB_READ_CONCURRENCY);
