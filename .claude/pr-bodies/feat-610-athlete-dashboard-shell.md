## What

M7 PR-D slice 1 (#610) — the athlete-side dashboard shell. Lays the `/dashboard/me/*` route tree so the remaining 4 sub-pages (academy, attendance, payments, documents) can slot in as children in follow-up slices. Also unblocks **M9 PR-B** (#602): `/dashboard/me/feed` becomes a trivial child route once this shell is in place.

### Added components

- **`AthleteDashboardComponent`** (`/dashboard/me`) — separate shell from the owner-side `DashboardComponent`. Mobile topbar + off-canvas drawer below 768px, fixed sidebar above. Sidebar carries the user avatar + name + handle, one nav entry (Profile), and the sign-out CTA. Stripped of owner-only chrome (no search palette, no notification bell — those land back later, scoped to athletes).
- **`MeProfileComponent`** (`/dashboard/me/profile`) — read-only view of the user's own contact info: first/last name, handle (with "no username set yet" fallback), email + verified/unverified badge. The "Editing your profile is coming in the next release" hint is the V1 stub for the Slice 4 edit surface.

### Modified

- **`app.routes.ts`**: new `/dashboard/me/*` block gated by `authGuard + roleAthleteGuard`. The legacy `/athlete-portal/*` block now redirects to `/dashboard/me/profile` for both `""` and `welcome` children — bookmark + in-flight invite-link backwards compat.
- **`role.guard.ts`**: athlete redirect target changes from `/athlete-portal/welcome` to `/dashboard/me/profile`. Docblock updated.
- **`AthleteInviteComponent`**: post-accept redirect changes from `/athlete-portal/welcome` to `/dashboard/me/profile`. Existing component spec updated to match.
- **`role.guard.spec.ts`**: the two assertions that hard-coded `/athlete-portal/welcome` now expect `/dashboard/me/profile`.
- **i18n EN + IT** (lockstep per `feedback_i18n_lockstep_with_features.md`): new `nav.sidebarAriaLabel` + `athletePortal.nav.profile` + `athletePortal.profile.*` keys (10 each side: title, firstName, lastName, handle, noHandle, email, verified, unverified, editHint, loading).

### Out of scope (later slices)

- `MyAcademyComponent`, `MyAttendanceComponent`, `MyPaymentsComponent`, `MyDocumentsComponent` → Slice 2 + 3.
- Profile EDIT (name, email change, password, avatar) → Slice 4.
- Deleting the `/athlete-portal/*` redirect block → Slice 5 after access logs confirm zero hits.

### Not in this PR but unblocked by it

- **M9 PR-B** (#602) — feed read API + SPA. `/dashboard/me/feed` is a trivial new child of the route established here.

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.` (after fixing the backdrop a11y warning to use `aria-hidden="true"` matching the owner-side convention)
- [x] `npm test -- --watch=false` — 100 spec files (+1), 833 tests (+5, all in MeProfileComponent spec)
- [x] Cold-cache rerun — totals confirmed
- [x] i18n parity: every new key landed in both `en.json` and `it.json` (the i18n-keys spec stays green)
- [ ] CI green
- [ ] No URL changes for owner-side users — only the athlete portal path migrated

### Post-merge smoke (manual)

- Athlete accepts a fresh invite → lands on `/dashboard/me/profile` (not `/athlete-portal/welcome`).
- Old bookmark on `/athlete-portal/welcome` redirects to the new shell.
- Athlete hitting `/dashboard/athletes` directly is redirected by `roleAthleteGuard` to `/dashboard/me/profile`.
- Owner hitting `/dashboard/me/*` is redirected by `roleAthleteGuard` (inverse) to `/dashboard`.

## Provenance

Slice 1 of the multi-PR M7 PR-D shell expansion (`docs/specs/m7-athlete-login.md`). Sliced from the original epic at the natural seam: the shell + first sub-page lands by itself so the remaining 4 sub-pages each ship as their own ~30-60 min PR with isolated review.

Also unblocks the M9 community feed read API + SPA (M9 PRD § Hard dependencies, the line about `/dashboard/me/feed` needing this shell first).

Closes #610.
