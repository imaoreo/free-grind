## Plan: Unified UI System Pass

Unify the entire app UI and behavior in one coordinated rollout by extracting repeated patterns into shared components, standardizing tokens/utilities, and enforcing consistent interaction states. Keep the existing modern orange-glow direction (inspired by Browse + mobile Inbox), apply across all app + auth pages, and validate with full responsive + behavior QA before merge.

**Steps**
1. Baseline and freeze visual rules: define canonical radius, spacing, typography usage, button variants, card variants, state styles, and modal behavior contract in existing style layer (blocks all later steps).
2. Build shared UI primitives in src/components/ui (depends on step 1): Button, Card, Avatar, Badge/Chip, EmptyState, LoadingState, ErrorState, and LoadMoreButton with consistent props and disabled/loading handling.
3. Add behavior hooks/utilities (parallel with step 2 after step 1): backdrop/ESC close helper, paginated list scroll helper, async state helper for loading/error/empty parity.
4. Migrate high-traffic pages first (depends on steps 2 and 3): Chat, Grid, Settings, Profile Editor. Replace duplicated inline Tailwind blocks with shared components and utilities.
5. Migrate remaining pages in one pass (depends on step 4): auth pages, About, albums/settings subpages, and placeholders, ensuring consistent hierarchy and interaction states.
6. Normalize copy and state messaging (parallel with step 5): loading/error/empty strings, button labels, and retry affordances.
7. Accessibility and expected-behavior hardening (depends on steps 5 and 6): keyboard/focus parity, touch target minimums, consistent disabled semantics, modal escape/backdrop behavior, and navigation affordances.
8. Global QA and regression sweep (depends on step 7): desktop + mobile breakpoints, data states, scroll/pagination behavior, modal interactions, and TypeScript/build checks.

**Relevant files**
- /Users/jaybr/Projects/Personal/open-grind/src/index.css — normalize design tokens/utilities.
- /Users/jaybr/Projects/Personal/open-grind/src/layout.css — align layout rhythm and spacing.
- /Users/jaybr/Projects/Personal/open-grind/src/components/ui/tabs.tsx — align existing primitive style/API.
- /Users/jaybr/Projects/Personal/open-grind/src/components/ui/ — add shared primitives.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/ChatPage.tsx — migrate message UI and state blocks.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/GridPage.tsx — migrate browse controls and pagination affordances.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/gridpage/components/BrowseGrid.tsx — standardize loading/empty/error/load-more rendering.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/gridpage/components/ProfileDetailsModal.tsx — align modal chrome and close behavior.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/ProfileEditorPage.tsx — extract inline helpers into shared components.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/SettingsPage.tsx — unify settings cards/actions.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/SettingsAlbumsPage.tsx — standardize error/empty/loading UX.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/app/AboutPage.tsx — align section styles and hierarchy.
- /Users/jaybr/Projects/Personal/open-grind/src/pages/auth/ — align auth flows to same standards.

**Verification**
1. Run npx tsc --noEmit and ensure no type regressions.
2. Validate migrated pages in mobile and desktop widths.
3. Check each major screen for loading, success, empty, error, disabled, and retry states.
4. Validate modal contract everywhere: ESC closes, backdrop closes, content click does not.
5. Validate list contract: load-more behavior and scroll anchoring.
6. Validate interaction parity: hover/focus/active/disabled states across controls.
7. Accessibility sanity checks: keyboard navigation, visible focus, and touch targets >= 44px.

**Decisions**
- Visual direction: preserve and standardize the current modern orange-glow aesthetic.
- Scope: full app including auth and edge pages.
- Delivery: one coordinated rollout rather than phased release.
- Included: UI primitives, layout/spacing consistency, behavior-state consistency, accessibility/usability parity.
- Excluded: backend API changes and unrelated business logic features.