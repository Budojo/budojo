## What

Removes the `App\Http\Controllers\Account\` namespace by relocating its sole inhabitant — `EmailChangeController` — into its two natural homes:

- `User\EmailChangeController` (new) — owns the authenticated `/me/email-change` resource (`requestChange`, `cancel`).
- `Auth\EmailVerificationController::verifyChange` (new method, alongside the existing `verify` for primary email) — owns the public token-based `/email-change/{token}/verify` endpoint.

The `Account/` directory is deleted entirely (no other class lived there).

URLs are **unchanged** — only the controller class FQCNs differ. No consumer impact (SPA, Cypress, OpenAPI spec).

Closes #579.

## Why

`Account/` had one resident while every other HTTP controller lives in `Auth/` (unauthenticated identity flows) or `User/` (authenticated `/me/*`). The split also restored symmetry within the controller's own responsibilities: `requestChange`/`cancel` are User-domain mutations, while `verify` is a token-based verification — structurally identical to `Auth\EmailVerificationController::verify` for the primary email.

After the refactor the rule "where does a new email-related controller go?" collapses to a binary (Auth or User), matching the rest of the codebase.

## How

1. **Created** `server/app/Http/Controllers/User/EmailChangeController.php` with `requestChange` + `cancel`. Constructor injects `RequestEmailChangeAction` + `CancelPendingEmailChangeAction` (same wiring as before, just relocated).
2. **Extended** `server/app/Http/Controllers/Auth/EmailVerificationController.php` with a new constructor injecting `ConfirmEmailChangeAction` and a `verifyChange(string $token): JsonResponse` method. The existing `verify(Request, int $id, string $hash): RedirectResponse` for primary-email signed-link verification is untouched.
3. **Updated** the 3 route lines in `server/routes/api_v1.php` to point at the new FQCNs.
4. **Updated** the docblock in `RequestEmailChangeAction.php` that referenced the old controller path.
5. **Deleted** `server/app/Http/Controllers/Account/EmailChangeController.php` and the empty `Account/` directory.

## Notes

- **Actions stay in `App\Actions\Account\`** for now (`RequestEmailChangeAction`, `CancelPendingEmailChangeAction`, `ConfirmEmailChangeAction`). The `Account/` Actions namespace also has only one feature in it, but its cleanup is a separate decision — issue #579's scope was explicitly "Controllers only". File as follow-up if desired.
- PEST feature tests for the email-change flow live under `tests/Feature/Account/` and import via URL (`$this->post('/me/email-change', ...)`), not FQCN — they pass unchanged.
- The two `verify*` methods on `EmailVerificationController` have different signatures (signed-URL → redirect vs POST-with-token → JSON). They are siblings in domain (token-based confirmation) but distinct in HTTP shape — no Liskov concern.

## Out of scope

- URL changes — `/me/email-change` and `/email-change/{token}/verify` stay as-is.
- Moving `App\Actions\Account\*` — separate cleanup if/when prioritized.
- Splitting `User\ProfileController` further — orthogonal.

## Test plan

- [x] `vendor/bin/php-cs-fixer fix` — clean
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — `[OK] No errors`
- [x] `vendor/bin/pest tests/Feature/Account/` — 19 tests pass (84 assertions)
- [x] `vendor/bin/pest tests/Feature/Auth/EmailVerificationTest.php` — 11 tests pass (31 assertions)
- [x] `php artisan route:list` confirms the 3 routes resolve to the new FQCNs:
  - `POST  /api/v1/email-change/{token}/verify → Auth\EmailVerificationController@verifyChange`
  - `POST  /api/v1/me/email-change             → User\EmailChangeController@requestChange`
  - `DELETE /api/v1/me/email-change            → User\EmailChangeController@cancel`
- [ ] CI green (phpstan + cs-fixer + pest --parallel + openapi-lint + the angular jobs that don't touch this area)
- [ ] No URL changes — Cypress email-change smoke implicit-pass via routing

## Provenance

Surfaced by `/graphify` cluster analysis on PR #578 (graphify integration). The graph flagged `Account/` as a 1-member namespace and the `verify`/`verify` pairing across Auth and Account as a semantic duplicate.
