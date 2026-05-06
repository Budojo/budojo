## What

Add the user-facing release notes for v1.17.0 in the canonical pair the team maintains by hand:

- `docs/changelog/user-facing/v1.17.0.md` — the markdown source.
- A new `Release` entry prepended to the typed `releases` array in `client/src/app/features/whats-new/whats-new.component.ts`.

The matching spec (`whats-new.component.spec.ts`) is bumped to expect 18 cards with `v1.17.0` at index 0 — that's the regression-catching trip-wire by design.

## Why

Per `CLAUDE.md` § "User-facing changelog (#254)": every stable release adds the markdown file AND prepends the typed array entry in the same commit history as the release train. The v1.17.0 train shipped to `main` at tag `v1.17.0` (PR #438) but the whats-new pair was missed during the release dance — this PR back-fills it before any subsequent release can compound the drift.

## How

The release covers eight features merged onto `develop` between v1.16.0 and v1.17.0:

- #433 — login rate-limit (5/min/IP)
- #434 — server-error + offline pages
- #435 — cookie consent banner + `/cookies` policy page
- #436 — `/dashboard/help` page with client-side search
- #437 — `/terms` page + acceptance gate on registration
- #439 — change password while logged in (`/me/password`)
- #440 — user avatar upload + replace + remove
- #441 — dedicated `/dashboard/support` contact form

The user-facing copy is grouped by theme rather than chronology — Help & support, Account, Legal & compliance, Resilience, Behind the scenes — so the page reads as a coherent train rather than a PR list.

## Test plan

- [x] `npm test -- --watch=false` — 632 specs pass (the bumped count assertion + version-order pin in `whats-new.component.spec.ts` validates the new entry sits at index 0)
- [x] `npm run lint` — clean
- [ ] Spot-check `/dashboard/whats-new` in the browser after merge — v1.17.0 card paints first, all five sections render with their emoji headings

## References

- Closes the v1.17.0 docs/code lock-step gap (no dedicated issue)
- v1.17.0 release tag: https://github.com/Budojo/budojo/releases/tag/v1.17.0
- Related: PR #406 (v1.16.0 whats-new), follows the exact same shape
