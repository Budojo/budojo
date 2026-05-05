## What

Cookie consent banner + `/cookie-policy` route (EN+IT).

Closes #421.

## Why

`docs/legal/cookie-audit.md` documented today's strictly-necessary storage but the SPA had no consent banner and no public cookie-policy page. Under the EU e-Privacy directive (and the Garante guidelines of 10 June 2021) the moment we wire any non-essential script — analytics, marketing pixel, embedded video — we need explicit consent first. Shipping the banner + the gate now, **before** any tracking, means a future analytics integration is a one-line `hasConsent('analytics')` away from being compliant on day one.

## How

**ConsentService (`core/services/consent.service.ts`).**
- Signal-based public surface: `decided()`, `choices()`, `hasConsent(category)` (returns a `Signal<boolean>` so consumers react to flips).
- Persists to `localStorage.budojoCookieConsent` as `{ version, choices, savedAt }`. `CONSENT_VERSION = 1` today; bumping it forces a re-prompt by invalidating the stored payload.
- `essential` is hard-locked on at the service AND the modal level.
- `acceptAll()` / `rejectNonEssential()` / `save(...)` write paths; `reopen()` flips `decided` back to `false` for the cookie-policy page's "Manage your preferences" link without clearing the persisted choice.

**CookieBannerComponent (`features/cookie-banner/`).**
- Sticky bottom card mounted once at the app root via `app.html`.
- Three CTAs (Accept all / Reject non-essential / Customise).
- Customise opens a `p-dialog` with `[breakpoints]="{ '768px': '92vw' }"` containing four `p-checkbox` rows. The essential row is disabled with an "Always on" badge.
- All copy lives under the `cookies.*` i18n namespace (EN + IT, lock-step).

**Cookie policy pages (`features/cookie-policy/{cookie-policy.component, it/cookie-policy-it.component}`).**
- Same shape as `/privacy{,/it}` — shared `_legal-page.scss` partial, language toggle, cross-links to `/privacy` and `/sub-processors`.
- Body documents the four categories and lists what's actually stored today (pulled from `cookie-audit.md`).
- "Manage your preferences" link reopens the banner without losing state.

**Cross-links + audit sync.**
- `client/src/app/features/privacy-policy/privacy-policy.component.html` (and the IT mirror) now point to `/cookie-policy` instead of just naming `cookie-audit.md`.
- `docs/legal/cookie-audit.md` updated to add `budojoLang` and `budojoCookieConsent`, to add a "Categoria banner" column, and to flip the operative conclusion to "banner ships preventatively, gate via `ConsentService.hasConsent(...)`".

## Decisions

- **localStorage over a cookie.** Matches the existing pattern (`auth_token`, `budojoLang`); no server consumes the consent state today. If a server-side consent log lands later, the storage can dual-write without changing `ConsentService`'s public API.
- **Signal-based gate.** `hasConsent(category): Signal<boolean>` is the readiest shape for an Angular consumer; a future analytics-bootstrap subscribes once and reacts to flips automatically.
- **`essential` always-on at the service AND the UI level.** Defence-in-depth: the modal disables the checkbox; the service ignores any save attempting to flip it.
- **What counts as "essential" today.** `auth_token`, `budojoLang`, `budojoCookieConsent` itself, and the service-worker app-shell cache. `documents.showCancelled` is categorised as `Preferences` since it's a UI nicety that can be opt-in without breaking the service.

## Test plan

- [x] `consent.service.spec.ts` — pristine state, accept/reject/save paths, persistence shape, stale-version re-prompt, corrupt-JSON degrade, reopen.
- [x] `cookie-banner.component.spec.ts` — renders on first visit, hides after decision, three CTAs, customise dialog opens with 4 categories, save persists, locked essential cannot flip, reopen re-shows.
- [x] `cookie-policy.component.spec.ts` — title, version stamp, language toggle to /it, cross-links to /privacy + /sub-processors, manage-preferences hooks the service, back-home navigates to `/`.
- [x] `cookie-policy-it.component.spec.ts` — Italian mirror.
- [x] `cookie-banner.cy.ts` — first visit shows banner, accept/reject persist across reload, customise dialog opens with 4 categories and save persists, version-bump re-prompts, no-stored-decision case, analytics-tag-not-loaded assertion after reject, /cookie-policy{,/it} reachable, manage-preferences re-shows the banner, privacy pages cross-link to /cookie-policy{,/it}.
- [ ] CI is the gate (no docker-bound local Angular gates in this isolated worktree).

## Out of scope

- Server-side consent log.
- Granular per-vendor toggles.
- Analytics integration itself — when the first one lands, `loader.ts` checks `consent.hasConsent('analytics')()` before injecting the script tag, then re-runs the check on signal flips.
