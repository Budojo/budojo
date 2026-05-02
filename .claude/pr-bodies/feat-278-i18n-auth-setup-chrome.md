## What

Closes #278. Second wave of the SPA i18n push (after #274 ngx-translate framework). Wires every visible string in **auth + setup wizard + chrome + 404** to translation keys, so the sidebar language toggle finally flips a meaningful chunk of the UI.

## Why

PR-A (#274) installed ngx-translate and translated the dashboard sidebar nav + the legal `/privacy` page. Toggling to Italian after PR-A still left the auth login screen, the register form, the email-verify pages, the setup wizard, and the 404 page in English (and `not-found.component.html` in Italian-only — wrong direction for the EN-default policy). This PR closes that gap for the surfaces a non-dashboard user touches first.

## Surfaces wired

- **Auth login** — title, subtitle, labels, placeholders, error messages, submit, "no account" / register link, footer Privacy + Sub-processors links.
- **Auth register** — same shape as login, plus the privacy-consent block. The accept-text is split into `Before` / `LinkText` / `After` keys so translators can reorder around the embedded `<a routerLink="/privacy">` without ngx-translate having to carry HTML in interpolations.
- **Auth verify-success** — title, message, "Go now" CTA.
- **Auth verify-error** — title, both message variants (canResend / cannotResend), both CTA variants.
- **Setup wizard** — title, subtitle, "Academy name" + errors, "Training days" + "(optional)" hint, submit.
- **Whats-new chrome** — brand aria-label, eyebrow, title, subtitle, "Back to dashboard" CTA. **Release notes content stays English-source** by design (see `whats-new.component` docblock — release entries are written for the same audience in one language).
- **404 page** — title, message, "Back to home" CTA. Previously hardcoded Italian; now English-default with IT translation.

## JSON updates

`en.json` + `it.json` updated to mirror the actual current English source strings (PR-A's placeholders were close but not exact — login title was "Sign in" in JSON vs "Welcome back" in template, etc.). All keys present in both files in lock-step; `i18n-keys.spec.ts` parity check still green.

## Test updates

Three component specs migrated to `provideI18nTesting()` (from the existing harness in `client/src/test-utils/i18n-test.ts`): `NotFoundComponent`, `WhatsNewComponent`, `RegisterComponent`. Test assertions on text content flipped where the source language flipped — `not-found` was the only spec asserting on Italian strings; those now assert on English (the new source).

Vitest matrix: 379 → 379 (no spec count change, just rewires).

## Notes

- Sidebar nav was already wired in PR-A.
- `/privacy` and `/privacy/it` keep their own toggles (legal pages have their own UX rhythm).
- `<p-toast>` / dialog / server-validation messages are NOT in this PR — that's PR-D scope (#280).
- Currency / date locale-aware formatting NOT in this PR — also PR-D.
- Dashboard page bodies (Athletes, Attendance, Documents, Academy, Profile) NOT in this PR — that's PR-C umbrella (#279).

## Test plan

- [x] `npx prettier --write` — clean.
- [x] `npm run lint` — clean.
- [x] `npm test -- --watch=false` — 379 tests pass.
- [ ] Cypress in CI.
- [ ] Manual smoke: open `/auth/login` in fresh browser → English. Toggle isn't on auth pages (only inside the dashboard sidebar) — pre-seed `localStorage.budojoLang = 'it'` and refresh → Italian. Same for register, setup, verify-success, verify-error, /404, /dashboard/whats-new chrome.

## References

- Closes #278.
- Tracking: #271 (i18n umbrella, EN → ES → DE).
- Predecessors: #273 → #274 (framework + sidebar + /privacy/en).
- Followers: #279 (PR-C, dashboard page bodies), #280 (PR-D, toast/error/locale).
