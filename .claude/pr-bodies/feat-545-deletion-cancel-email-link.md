## What

Email-link cancel flow for the `pending_deletions` 30-day grace window. Closes #545.

The user clicks **"Cancel deletion"** in the deletion-confirmation email and lands on a public SPA page that consumes the one-time token, deletes the `pending_deletions` row, and shows a calm confirmation. No login required — the click from the inbox is the auth.

## Why

Carved out of the closed #223 umbrella by the post-v2.3.2 tech-debt sweep. The schema (`pending_deletions.confirmation_token`) has been ready since #223 shipped; the Mailable existed but linked to the SPA root with a "sign in to cancel" placeholder. This PR lands the actual deep-link UX.

## How

### Backend

- **`POST /api/v1/me/deletion-request/cancel/{token}`** — public, unauthenticated. Token bound at the route level (`[A-Za-z0-9]{64}`), so a malformed link 404s before the controller fires. Returns 200 with `data: { cancelled: bool }`:
  - `true`  — token matched an active row, the row is gone, account safe.
  - `false` — already-clicked / never-valid / already-purged. Same shape for all three; we deliberately don't leak which case the user is in.
- **`CancelAccountDeletionByTokenAction`** — sibling to the existing `CancelAccountDeletionAction`. Single-shot `delete()` on the row, returns the truthy outcome.
- **`AccountDeletionRequestedMail`** — now takes the `confirmation_token` and the Blade template builds the cancel deep-link URL (`{client_url}/account/deletion-cancel/{token}`). Replaces the placeholder "Sign in to cancel → land on /dashboard/profile" CTA.
- **OpenAPI** — new path under `/me/deletion-request/cancel/{token}` with the 64-char regex, the cancelled-bool response shape, and the deliberate same-shape semantics for the three cancellation outcomes. Spectral 0 errors.

### Frontend

- **Public route** `/account/deletion-cancel/:token` outside the dashboard shell. Lazy-loaded.
- **`AccountDeletionCancelComponent`** reads the token, POSTs on mount, lands on one of four panels: `loading` / `cancelled` / `no-longer-pending` / `error`. No auto-redirect — the user just clicked an email link, they deserve a calm landing page that stays put until they tap the bottom CTA.
- **`AccountDeletionService.cancelByToken(token)`** — only the public call today; when the profile page lands the authenticated request/cancel flows (still pending UI for #223), they are the natural neighbours.
- **i18n** — EN + IT keys under `accountDeletion.cancel.*` for all four panel states. Parity test green.

### Tests

- 5 PEST feature specs for the API: happy cancel, idempotent re-click, no-auth, malformed-token route 404, one-shot semantics.
- 2 PEST assertions added to the existing `AccountDeletionEmailTest`: the queued mail's `cancelToken` matches the row's `confirmation_token`, and the rendered HTML carries the deep-link path.
- 7 vitest specs for the SPA component: loading / success / no-longer-pending / error / unauth-CTA-target / signed-in-CTA-target / missing-token-defense.
- 3 Cypress E2E specs for the public route covering each response shape.

## Out of scope

- The authenticated request/cancel UI on `/dashboard/profile` — separate UI surface still to land. The endpoints exist server-side since #223; the SPA just doesn't render them yet. Not blocked by this PR.

## References

- #545 — this issue
- #223 — original umbrella where the schema + base Mailable shipped
- `server/database/migrations/2026_04_29_170000_create_pending_deletions_table.php:55` — the `confirmation_token` column already in place

## Test plan

- [x] PHPStan clean
- [x] PEST AccountDeletion family green (23 specs, 70 assertions)
- [x] Vitest 729 specs green (7 new in `account-deletion-cancel.component.spec.ts`)
- [x] Cypress E2E 3 specs green (in CI)
- [x] Spectral OpenAPI lint 0 errors
- [x] EN/IT i18n parity
- [ ] Manual smoke after deploy: trigger a deletion request, click the email link, confirm the SPA lands the success panel + the row is gone from `pending_deletions`
- [ ] Manual smoke: a second click on the same link lands the "no longer pending" panel
