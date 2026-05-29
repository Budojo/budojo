# Navigation — social-native model

Source of truth for Budojo's navigation IA + the shared nav components. Implements [epic #1107](https://github.com/Budojo/budojo/issues/1107). Read alongside [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) and `client/CLAUDE.md` § Mobile-first.

## Why we moved off the sidebar/hamburger

The SaaS sidebar + hamburger drawer reads "management tool". Budojo's strategy is mobile-first (the store app is the primary surface), so the navigation follows the **social-native** model (Instagram / TikTok / Facebook):

- The hamburger **hides** destinations → fewer visits to secondary sections (the documented FB/IG migration off the hamburger to bottom tabs lifted engagement).
- A **bottom tab bar** is always-visible and thumb-reachable on a phone (Fitts) — and reads "an app, not a spreadsheet" (retention + store-review quality).

## Information architecture

Bottom nav = **max 5 slots** (Miller + iOS/Material guidance). The center slot is the **➕ create** action (a button, not a route). There are two shells — owner (`features/dashboard`) and athlete (`features/athlete-dashboard`) — each gets a role-appropriate tab set from the **same** shared component.

### Athlete (`athlete-dashboard`) — the social experience

| Slot | Icon | Destination | Notes |
|------|------|-------------|-------|
| 1 | `pi pi-home` | Feed | the community feed = the social home |
| 2 | `pi pi-bolt` | Academy / Leaderboard | their academy hub + ranking |
| 3 (center) | `pi pi-plus` | **➕ create** | check-in to today's class / new post |
| 4 | `pi pi-bell` | Notifications | engagement surface (the IG "heart") |
| 5 | `pi pi-user` | Profile | their athlete profile — the social "me" page |

### Owner (`dashboard`) — admin, but mobile-native

| Slot | Icon | Destination | Notes |
|------|------|-------------|-------|
| 1 | `pi pi-home` | Home | academy dashboard |
| 2 | `pi pi-users` | Athletes | the roster — core daily |
| 3 (center) | `pi pi-plus` | **➕ create** | mark attendance / + athlete / post |
| 4 | `pi pi-comments` | Community | the feed |
| 5 | `pi pi-ellipsis-h` | More | a hub page (`/dashboard/more`) of the demoted destinations + sign-out |

### Demoted to the More hub (NOT tabs)

`Attendance`, `Stats`, `Activity`, `Settings`, `My profile`, `Support`, `What's-new`, a dedicated `Language` picker, and `Sign out`. These live on the `/dashboard/more` hub (`OwnerMoreComponent`, #1111) reached from slot 5 — the mirror of the athlete `/dashboard/me/more` hub (#1109). The hamburger off-canvas drawer — and its swipe-to-close gesture + body-scroll-lock — is retired with this slice. The full daily attendance grid is one tap into More; the ➕ "Mark attendance" is the fast path to today's marking.

What **stays**: the Cmd/Ctrl-K command palette (`#426`) and the notification bell remain reachable (the bell folds into the athlete Notifications tab; on owner it stays in the mobile topbar (#1111)).

## The ➕ create action — `app-create-sheet`

A role-aware slide-up bottom sheet (mobile) / popover (desktop) of quick actions:

- **Athlete**: Check-in to today's class · New post
- **Owner**: Mark attendance · Add athlete · New post

Shared component; the host passes the role-appropriate action list. The center ➕ in the bottom nav emits `centerActivated`; the shell opens the sheet.

## Desktop — social rail (not the dense SaaS sidebar)

Desktop is modernized too (epic decision). Same IA as mobile, surfaced as a **left rail** (the Instagram / X web pattern): the same destinations as the bottom tab bar as icon+label rows (active → bold + indigo glyph), a prominent ➕ **Create** button, and the profile pinned at the bottom. The bottom tab bar is mobile-only; the rail is desktop-only. Same destinations, same labels — only the chrome differs by breakpoint.

The **athlete rail shipped in #1110** (light surface, hairline right border): Feed · Academy · Attendance · More as rows, ➕ Create (reuses the shared create-sheet), and the profile chip → the `/dashboard/me/more` hub (where settings / language / sign-out live). "More" is a row that opens the hub, not an in-rail expander — so the demoted destinations (payments, documents, settings, public profile) sit on the same hub as on mobile. The **owner rail is #1112**.

## Component contracts

### `app-bottom-nav` (shared, presentational)

```
inputs:
  tabs: BottomNavTab[]            // ordered; the center ➕ is injected at the middle
  centerAction: { icon; ariaLabel; dataCy } | null   // null → no center button
  ariaLabel: string              // the <nav> landmark label (translated by the host)
outputs:
  centerActivated: void          // the ➕ was tapped

BottomNavTab = { icon; label; routerLink; dataCy?; badge?: number | null }
```

- **a11y**: a `<nav [aria-label]>` landmark with `<a routerLinkActive>` items carrying `aria-current="page"` on the active route. The ➕ is a `<button>` (opens the sheet, navigates nothing). **Not** `role="tablist"` — that pattern is for in-page tab panels; these are route links.
- **Touch + safe-area**: every item ≥ 48 × 48 px (Fitts / MD3); the bar is `position: fixed; bottom: 0` with `padding-bottom: env(safe-area-inset-bottom)` for the iOS home indicator; `100dvh`-aware so it never floats over the keyboard.
- **Responsive**: the host shows it only `< 768px` (the desktop rail replaces it above). Optional hide-on-scroll (IG behaviour) is a polish item (`#1113`), not the shell.
- **Badge**: optional unread count per tab (the Notifications tab uses it).

### `app-create-sheet` (shared)

A `p-drawer`/bottom-sheet (mobile, `position: bottom`) of role-passed actions, each a 48px row (icon + label). Dismiss on backdrop / Esc. Built in the first mobile slice (`#1109`), reused by the owner slice (`#1111`).

## Migration notes

- The hamburger drawer + its pointer/swipe handlers + the topbar hamburger (`data-cy="topbar-hamburger"`) are removed on mobile; E2E specs asserting them move to the bottom-nav `data-cy` hooks (`#1113`).
- `docs/design/mobile-ux-audit.md` § "Drawer + chrome" is reconciled — the drawer model is superseded (`#1113`).
- Every slice changes visible chrome → in-browser visual verification per [`visual-verification.md`](../development/visual-verification.md) is mandatory on each.
