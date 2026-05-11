## What

Adds the missing Vitest spec for `NotificationBellComponent`. Fourth slice of the umbrella issue #588.

9 tests covering the bell's full state machine:

1. `ngOnInit` hydrates the badge by firing `inboxService.load()`.
2. `openRow` on an **unread** row WITH a `link` → marks read + navigates + closes the popover.
3. `openRow` on an **already-read** row → skips `markAsRead`, still navigates + closes.
4. `openRow` on an **unread** row WITHOUT a `link` → marks read + closes, no navigation.
5. `markAllRead()` calls `inboxService.markAllAsRead()`.
6. `refresh()` is callable repeatedly and fires `inboxService.load()` each time.
7. `refresh()` resets the `loading` signal to `false` even when the HTTP request errors (covers the silent-failure path).
8. `onVisibilityChange` fires `refresh()` when the tab becomes visible — covers the "user switched back to this tab" wake-up signal.
9. `onVisibilityChange` does NOT fire `refresh()` when the tab becomes hidden — guards against double-fetch on tab-switch-away.

Part of #588 (umbrella). Pairs with PRs #589, #590, #591.

## Why

`NotificationBellComponent` is the most-interactive of the 4 verify-family-and-friends components — it has both a state machine (loading, rows, unread count via signals from the service) AND a side-effect chain (mark-read + navigate + close-popover in `openRow`). Cypress covers the happy path of the bell on the dashboard E2E; this Vitest spec covers the branchy logic per row state (unread/read × has-link/no-link) and the visibility-change wake-up — which Cypress doesn't reach because `document:visibilitychange` is not naturally fireable from headless Chrome.

## How

`signal()` + `computed()` mocks for the service's `rows` / `unread` / `hasUnread` exposures (the component reads them via signal getters inside the template — must be real Signals, not plain functions). Service action methods (`load`, `markAsRead`, `markAllAsRead`) are `vi.fn(() => of(...))` mocks; one variant returns `throwError(...)` to exercise the loading-on-error path.

`@ViewChild('panel')` Popover is replaced with `{ hide: vi.fn(), toggle: vi.fn() }` post-`detectChanges()` so the test doesn't depend on PrimeNG popover internals.

`Object.defineProperty(document, 'visibilityState', ...)` for the visibility branch — toggles between `'visible'` and `'hidden'` per test. Standard jsdom pattern for this hook.

## Out of scope

- Cypress E2E for the bell — already exists on the dashboard suite, covers the happy path.
- Refactoring `openRow` to a single-call action (currently 3 sequential side-effects: mark / navigate / close).
- The remaining 4 components in #588 (onboarding-checklist, athlete-invite, setup, profile-api-tokens).

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 96 spec files (+1), 808 tests (+9)
- [x] Cold-cache rerun — same totals confirmed
- [ ] CI green

## Provenance

Same coverage-gap audit (#588). Fourth of 8 slices in the umbrella. Three simpler ones (welcome / verify-success / verify-error) already shipped — this is the first with non-trivial reactive surface.
