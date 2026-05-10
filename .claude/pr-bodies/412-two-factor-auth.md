## What

TOTP-based two-factor authentication (#412). Owners can opt in from `/dashboard/profile` (new "Two-factor authentication" card), scan a QR with any authenticator app, confirm with a 6-digit code, and receive 8 single-use backup codes. From that point every login asks for a second factor (TOTP or backup code).

## Why

Owner accounts are the keys to the academy roster + payment records. Password-only auth has been the only gate; #412 closes the gap. Backup codes give a recovery path that doesn't require a phone reset.

## How

**Server (Laravel 13)**

- Migration adds three nullable columns on `users`: `two_factor_secret`, `two_factor_recovery_codes` (both encrypted via Eloquent `encrypted` / `encrypted:array` casts, both `$hidden` on the model), `two_factor_confirmed_at` (the load-bearing "is 2FA active?" flag).
- `App\Support\TwoFactorAuth` — thin wrapper over `pragmarx/google2fa`: generate secret, build provisioning URI, verify TOTP, mint + consume backup codes (`XXXX-XXXX` format, ambiguous-char-free alphabet).
- `App\Http\Controllers\User\TwoFactorController` — five endpoints under `/api/v1/me/two-factor`:
  - `GET` — current enrolment shape (`enabled` / `pending` / `recovery_codes_remaining`).
  - `POST /enrol` — mint a fresh secret, return provisioning URI for QR rendering.
  - `POST /confirm` — verify TOTP, flip `confirmed_at`, return 8 backup codes ONCE.
  - `POST /recovery-codes/regenerate` — replace the backup codes en bloc.
  - `DELETE` — wipe all three columns; requires current password as a re-auth gate (defense in depth against stolen sessions).
- `LoginController`: on a valid password, when `two_factor_confirmed_at` is non-null, demand `two_factor_code`. Returns `422 two_factor_required` (first attempt without code) or `422 invalid_two_factor_code`. Backup codes are consumed on use (the array shortens by one).

**Client (Angular 21 + PrimeNG 21)**

- `TwoFactorService` wraps the 5 endpoints.
- `ProfileTwoFactorComponent` (mounted on `/dashboard/profile`) — 3-state panel (off / pending / active). QR via `qrcode` npm package. Recovery-codes dialog surfaces the plaintext codes ONCE after confirm/regenerate with a "save these somewhere safe" warning. Disable dialog re-auths with the current password.
- `LoginComponent` — two-step submit. On `two_factor_required` the form swaps to a code-entry step; second submit retries with `two_factor_code` appended.
- i18n: full EN+IT lockstep for both surfaces.

**Docs**

- `docs/api/v1.yaml` — 5 new operations + `LoginRequest` schema + extended `/auth/login` description (the 2FA branch).
- `docs/entities/user.md` — three new columns + a business rule explaining the consume-on-use backup-code contract + endpoint links.

## Notes

- `qrcode` package added to the client (one-shot client-side QR rendering — kept the server free of base64 SVG bloat in the JSON envelope).
- Backup codes use an ambiguous-char-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) so users typing from a printout don't fight 0/O, 1/I glyph similarity.
- Encryption ciphertext inflates beyond varchar 255, so both secret + recovery-codes columns are `text`.

## Out of scope

- WebAuthn / passkeys — TOTP first, hardware key follow-up.
- "Trust this device for 30 days" cookie — every login asks for a code; the cost is a 10-second extra step on the owner's daily login.
- 2FA enforcement on athlete accounts — V1 owner-only.

## References

- Closes #412

## Test plan

- [x] `vendor/bin/pest tests/Feature/Auth/TwoFactorTest.php` — 13 specs green (48 assertions).
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — clean at level 9.
- [x] `vendor/bin/php-cs-fixer fix` — no drift.
- [x] `npm test -- --watch=false` — 772 specs green including the 15 new ones.
- [x] `npm run lint` — clean.
- [x] Spectral OpenAPI lint — 0 errors (pre-existing warnings only).
- [ ] Manual smoke: enrol → confirm → backup-code login → disable.
- [ ] Cypress E2E green in CI.
