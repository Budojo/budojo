# Mobile UX audit — Budojo SPA

Living roadmap of mobile-ux gaps found in the SPA, prioritised against the design canon in [`client/CLAUDE.md`](../../client/CLAUDE.md) § Mobile-first. Each row tracks one gap from "spotted" to "shipped".

**Status legend**: 🟢 shipped · 🟡 in flight · 🔴 backlog · ⚪ won't-fix (with rationale)

## ── Drawer + chrome

| # | Gap | Status | PR / Issue |
|---|---|---|---|
| 1 | Open drawer + drag inside it → page below scrolls (touch bleed-through) | 🟢 | #671 → #672 (body scroll-lock + `overscroll-behavior: contain`) |
| 2 | Open drawer rubber-bands up/down on touch-drag | 🟢 | same: `overscroll-behavior: contain` |
| 3 | No swipe-left-to-dismiss on the drawer (Android nav-standard gesture) | 🟢 | #669 shipped |

## ── List-heavy views (table vs cards on mobile)

Per `client/CLAUDE.md` § Mobile-first: "Tables either wrap in a scrollable container (horizontal scroll acceptable with visual cue) or **collapse to a card layout below 768px**. The choice is per-feature; **list-heavy views prefer cards**."

| # | View | Current | Mobile target | Status | PR / Issue |
|---|---|---|---|---|---|
| 4 | Athletes list (`/dashboard/athletes`) | `<p-table>` w/ `responsiveLayout="scroll"` | Apple-minimalist cards w/ 3-dot menu, name+badges+socials | 🟢 | #674 shipped |
| 5 | Daily attendance (`/dashboard/attendance`) | `<p-table>` | Tap-to-toggle cards (name + belt + present indicator, whole-card tap target, aria-pressed) | 🟢 | #677 shipped |
| 6 | Monthly summary (`/dashboard/attendance/summary`) | `<p-table>` | Cards (one per athlete) — name left, count/percent right | 🟢 | #678 shipped |
| 7 | Athlete documents tab | `<p-table>` | Apple-minimalist cards: type + actions header, filename, expiry/cancelled status badge | 🟢 | #679 shipped |
| 8 | Athlete payments tab | `<p-table>` | Cards (one per month, status tag + amount + paid-on date + mark/unmark affordance) | 🟢 | #680 shipped |
| 9 | Expiring documents list (`/dashboard/documents/expiring`) | `<p-table>` | Cards: athlete name link + download header, doc type middle, expiry status badge bottom | 🟢 | #681 shipped |

## ── Dialogs missing mobile breakpoints

`<p-dialog>` instances must carry `[breakpoints]="{ '768px': '92vw' }"` (or `100vw`) so they never overflow on phone screens. Audit:

| # | Component | Status | Notes |
|---|---|---|---|
| 10 | `upload-document-dialog` | 🟢 | `[breakpoints]` set |
| 11 | `search-palette` | 🟢 | `[breakpoints]` set |
| 12 | `event-composer` | 🟢 | `[breakpoints]` set |
| 13 | `cookie-banner` | ⚪ | Not a dialog visually — sticky strip |
| 14 | `profile-two-factor` (enrolment + backup-codes flows) | 🟢 | Both dialogs now carry `[breakpoints]="{ '768px': '92vw' }"`, replacing the inline `maxWidth: '90vw'` workaround |
| 15 | `profile-api-tokens` (create + plaintext token flows) | 🟢 | Both dialogs now carry `[breakpoints]="{ '768px': '92vw' }"` |

## ── Filter clusters (cramped on narrow viewports)

The athletes-list filter bar shows three `<p-select>` dropdowns + a search field on one row; on phone they stack vertically and consume ~3 rows of viewport. Same pattern likely repeats on attendance/summary pages.

| # | View | Status | Notes |
|---|---|---|---|
| 16 | Athletes-list filters | 🔴 | Move to "Filtri" CTA → bottom-sheet w/ all dropdowns inside. Recovers ~80px of viewport for the list. Reusable across attendance + payments + expiring-documents |

## ── Touch targets + tap affordances

| # | Surface | Status | Notes |
|---|---|---|---|
| 17 | All `<p-button icon="..." [text]="true">` inline action buttons (Edit / Delete / etc.) | 🟢 | Already 40+ px with default PrimeNG sizing per the design system audit; spot-check on 320px viewport when porting each list to cards |
| 18 | Topbar hamburger + avatar | 🟢 | 48 × 48 (#411) |

## ── Forms

Spot-check existing `*.scss` files:

- `athlete-form.component.scss` — `@media (max-width: 640px) { grid-template-columns: 1fr }` — multi-col grids collapse to single column on mobile ✅
- `academy-form.component.scss` — similar pattern, audit when reaching the form page
- `profile.component.scss` — multi-section page; the "Cambia password" + "Two-factor" sub-cards already render single-column on mobile per design system

## ── PWA install + offline

| # | Gap | Status | Notes |
|---|---|---|---|
| 19 | Installed PWA without cache + offline shows Chrome's "ERR_CONNECTION_ABORTED" page instead of our `/offline` route | 🟢 | #706 — `ngsw-config.json` gained `navigationUrls` (excludes `/api/**` + `/storage/**` so SPA-fallback HTML never gets served on those paths) and a narrow `dataGroups` whitelist (`/api/v1/athletes**`, `/api/v1/academy`, `/api/v1/community/feed`) under the `freshness` strategy with a 3s timeout + 1h max age. Sensitive endpoints (`/me/**`, `/auth/**`, downloads, exports) intentionally NOT cached. The `/offline` route + `OfflineComponent` were already in place from #425. Telegram in-app browser remains the open question — separate investigation when it surfaces again. |
| 20 | Service worker auto-update on new version (#305) | 🟢 | Working — verified in audit chat |

## Methodology

Audit conducted 2026-05-13 with two inputs:
1. Live screenshots from the user testing the v2.10.1 PWA inside the Telegram in-app browser on an iOS phone (Apple Safari rendering engine).
2. Static grep across `client/src/app/features/**/*.html` + `**/*.scss` for `<p-table>`, `<p-dialog>`, `grid-template-columns`, and `@media` boundaries.

Findings are re-prioritised every release. When a row ships, its status flips to 🟢 with the PR number; when a deeper investigation reveals a row is already-handled / won't-fix, it flips to ⚪ with the reasoning.
