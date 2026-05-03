# Free Grind backlog

This file tracks near-term feature work and bugs that still need follow-up.
It complements `ROADMAP.md`, which tracks broader feature progress.

Last updated: 2026-05-03

## New features

### High priority

- [ ] Sign in with Google
- [ ] Audio message recording
- [ ] Location messages in chat
- [ ] Saved phrases
- [ ] GIF / Gaymoji support
- [ ] Replies UI in conversations
- [ ] Interest views history
- [ ] Interest taps history
- [ ] Profile view self-reporting in Interest
- [ ] Push notification preferences or settings UI

### Medium priority

- [ ] Favorite and unfavorite profiles
- [ ] Block and unblock profiles
- [ ] Profile reports
- [ ] Grid filtering
- [ ] Right now feed fetching
- [ ] Right now feed filtering
- [ ] Right now feed sorting
- [ ] Right now feed posting
- [ ] Account settings management for email, password, and privacy

## Bugs and follow-up fixes

### Android notifications

- [ ] Device-test foreground suppression for chat notifications when the matching conversation is already open.
- [ ] Device-test foreground suppression for tap notifications when the Taps tab is already open.
- [ ] Verify notification-open routing always lands on the correct chat or taps screen after resuming the app from background.
- [ ] Verify fast app switching does not leave stale route state that suppresses the wrong notification.

### Realtime and Interest

- [ ] Verify websocket plus API refresh deduplication so the same tap never appears twice in Interest.
- [ ] Verify Inbox and Interest red-dot indicators clear consistently after opening the relevant screen and remain correct after app restart.
- [ ] Verify relative timestamps in Interest remain correctly ordered during long sessions and after pull-to-refresh.

### Cleanup

- [ ] Update `ChatRealtimeBridge` header comments so they match the current system-notification behavior.
- [ ] Add regression coverage for notification suppression and notification-open routing.