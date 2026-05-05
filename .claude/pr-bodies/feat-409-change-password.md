## What

Adds an in-app **change-password** flow on `/dashboard/profile` so a logged-in user can rotate credentials without going through the public forgot-password email round-trip.

Closes #409.

## Why

Logged-in users had no path to change their password from inside the SPA — the only option was the forgot-password email flow, which forces a logout-style round-trip even for routine credential rotation. Basic SaaS account-management gap.

## How

### Server (`POST /api/v1/me/password`)

- New thin controller `App\Http\Controllers\Auth\ChangePasswordController` (single `__invoke`).
- New `App\Http\Requests\Auth\ChangePasswordRequest`:
  - `current_password` — closure rule running `Hash::check` against the authenticated user's stored hash. Re-auth gate.
  - `password` — `required|string|min:8|confirmed` (mirrors `RegisterRequest` / `ResetPasswordRequest` exactly so a rotation cannot weaken the registration policy) + `Rule::notIn([current_password])` so a no-op rotation is rejected with a 422 on the `password` field.
- New `App\Actions\Auth\ChangePasswordAction::execute(User $user, string $newPassword)`:
  - Writes the new hash via `forceFill(['password' => Hash::make(...)])->save()`.
  - Reads `$user->currentAccessToken()` — when it's a real `PersonalAccessToken` (production bearer auth path), preserves that row's id and deletes every other token on the user. When it's a `TransientToken` or null (no real id to preserve), revokes all tokens — strictly safer fallback.
- Route under `auth:sanctum` middleware in `server/routes/api_v1.php`, throttled `throttle:5,1` (Laravel's default IP key) — same shape as `/auth/login` and `/me/deletion-request`.

### Client (`/dashboard/profile`)

- New change-password card on the profile page: three `<p-password>` controls (current, new, confirm) inside a Reactive Form with the same validators as the reset-password page (`min:8`, `passwordsMatchValidator()`).
- New `AuthService.changePassword({ current_password, password, password_confirmation })`.
- Inline error mapping under the offending field for 422s:
  - `errors.current_password` → red message under the current-password field.
  - `errors.password` → red message under the new-password field (covers same-as-old + weak from the server side).
  - any other shape → generic inline error.
- Success toast (`Password updated`) + form reset on 200.
- EN + IT translations added in lock-step under `profile.changePassword.*`.

### Docs

- `docs/api/v1.yaml` — new `POST /me/password` operation + `ChangePasswordRequest` schema.
- `docs/entities/user.md` — new business rule entry for in-app password rotation + endpoint listed under "Related endpoints".

## Decisions

- **Session-keep-current vs revoke-all.** The Action preserves the token id used for the request and deletes every other token. A password change SHOULD invalidate other sessions (defence-in-depth: a hijacked session is logged out the moment the legitimate owner rotates) but should NOT yank the user's own active tab — that's hostile UX and would scare them into thinking the change failed. The fallback path (no real `PersonalAccessToken` available, e.g. `Sanctum::actingAs` test paths) is to revoke everything; the test suite uses real bearer tokens via `$user->createToken('auth')->plainTextToken` to exercise the production code path.
- **Re-auth gate as a closure rule on the FormRequest, not in the Action.** Per server canon: FormRequests own validation, Actions own business operations. A wrong-current-password is a 422 on `current_password`, not a 401/403 — the user's session is fine, it's the supplied current-password that isn't.
- **Same-as-old gate on the FormRequest, not in the Action.** Same rationale — it's payload-level validation, not a business operation.
- **No new throttle named limiter.** `throttle:5,1` (Laravel default, IP-keyed) is the established shape on `/auth/login` and `/me/deletion-request` for re-auth-gated endpoints. Adding a custom named limiter would be ceremony — the standard middleware already covers the threat model.

## Notes

- New password policy mirrors `RegisterRequest` / `ResetPasswordRequest` exactly. Anything stronger (entropy meter, HIBP check) is explicitly out of scope per the issue.
- Inline errors over toast for failures: the user is staring at the form, an inline error reads naturally; toasts are reserved for the success path so the user knows the operation completed without having to inspect a now-empty form (Norman § feedback).
- The change-password card sits between the user-info card and the data-export card on the profile page — settings-tier hierarchy, secondary-outlined submit (`size="small"`), no claim on the page-level primary CTA budget.

## Out of scope

- Password strength meter / HIBP check.
- 2FA.
- Active-sessions list.

These each ship as their own issue per the umbrella in #167.

## Test plan

- [x] PEST feature tests in `server/tests/Feature/Auth/ChangePasswordTest.php`:
  - Happy path: 200 + new password works on `/auth/login`.
  - Wrong `current_password` → 422 on `current_password`, password unchanged.
  - Same-as-old → 422 on `password`, password unchanged.
  - Too-short / mismatched → 422 on `password`.
  - Unauthenticated → 401.
  - Token revocation: three concurrent tokens, only the request's token survives, surviving token still authenticates `/auth/me`.
  - Throttle: 6th call returns 429.
- [x] Vitest unit specs in `client/src/app/features/profile/profile.component.spec.ts`:
  - Renders the form when the user is loaded.
  - Blocks submit on empty / too-short / mismatched.
  - Happy path: calls service with payload, resets form, shows success toast.
  - 422 mapping: `errors.current_password` → 'current' inline error; `errors.password` → 'password' inline error; unmapped → 'generic'.
  - In-flight guards: toggles `changingPassword`, ignores re-clicks.
- [x] Cypress E2E in `client/cypress/e2e/change-password.cy.ts`: happy-path round-trip with intercepted backend.
- [x] EN + IT translations parity (the i18n-keys spec is the trip-wire).
- [x] CI: all 13 checks green (phpstan / pest / php-cs-fixer / vitest / eslint / prettier / 4 cypress shards / spectral / worker tests).
- [x] Copilot review addressed (5 comments): save+token-revoke wrapped in DB::transaction; authInterceptor handles 401 globally for outgoing-with-token requests so a tab whose token was revoked elsewhere lands on /auth/login instead of sitting broken; changePasswordServerError cleared at the top of submit() before the form-validity guard; mismatch error now picked up in the field's invalid-class binding; newPasswordServerError copy reworked to cover all three rejection reasons.
- [ ] Manual smoke (post-merge): change a password from /dashboard/profile, confirm the success toast, confirm a second tab gets bounced to /auth/login on its next request.

## References

- Issue #409
- Umbrella issue #167 (account-management)

