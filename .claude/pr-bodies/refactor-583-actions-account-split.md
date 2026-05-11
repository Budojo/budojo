## What

Follow-up to #579 (Controllers move). Splits the remaining `App\Actions\Account\*` + `App\Http\Requests\Account\*` residents by consumer, so the `Account/` namespace disappears from both layers.

| From | To | Consumer |
|---|---|---|
| `App\Actions\Account\RequestEmailChangeAction` | `App\Actions\User\RequestEmailChangeAction` | `User\EmailChangeController::requestChange` (and `Athlete\ChangeAthleteEmailAction` State C) |
| `App\Actions\Account\CancelPendingEmailChangeAction` | `App\Actions\User\CancelPendingEmailChangeAction` | `User\EmailChangeController::cancel` |
| `App\Actions\Account\ConfirmEmailChangeAction` | `App\Actions\Auth\ConfirmEmailChangeAction` | `Auth\EmailVerificationController::verifyChange` (added in #581) |
| `App\Http\Requests\Account\RequestEmailChangeRequest` | `App\Http\Requests\User\RequestEmailChangeRequest` | `User\EmailChangeController::requestChange` |

After this PR, the `Account/` namespace is gone from `App\Actions\` and `App\Http\Requests\`. (The Controllers namespace `App\Http\Controllers\Account\` was already removed in #581.)

Closes #583.

## Why

Same pattern as #579, one layer down:

- The `Account/` namespace had 3 Actions + 1 FormRequest sitting next to its only consumer (`Controllers\Account\EmailChangeController`). When #579 redistributed the Controller across `User\` and `Auth\`, those Actions and the Form Request kept pointing at a namespace whose Controller was already gone.
- Co-locating each Action with the namespace of its consumer makes the import graph self-explanatory: `User\EmailChangeController` imports `User\…` for everything; `Auth\EmailVerificationController` imports `Auth\…` for the verify-change action it now owns.
- One less arbitrary namespace decision for future code reviewers and Claude sessions (the question collapses to "Auth or User?", same as for Controllers post-#581).

## How

- `git mv` on the 4 files (preserves blame).
- Update the 4 file's `namespace` line.
- Update `use` imports across 4 consumer files:
  - `server/app/Http/Controllers/User/EmailChangeController.php` — 3 imports (2 Actions + 1 FormRequest)
  - `server/app/Http/Controllers/Auth/EmailVerificationController.php` — 1 import (the Confirm action)
  - `server/app/Actions/Athlete/ChangeAthleteEmailAction.php` — 1 import (`RequestEmailChangeAction`, used in State C of the athlete email-change flow)
  - `server/app/Http/Resources/UserResource.php` — 1 import (`RequestEmailChangeAction`, used inside the resource as a constant carrier)
- `rmdir` the now-empty `App\Actions\Account\` and `App\Http\Requests\Account\` directories.

## Notes

- **No URL changes, no behavioural changes.** The 3 Actions' public `execute(...)` signatures, the FormRequest's `rules()` + `authorize()` — all untouched. PEST feature tests import via URL, not FQCN, so they pass unchanged.
- **Test directory left alone.** Tests live under `tests/Feature/Account/` — that directory name describes the user-facing feature ("the user's email-change resource"), not the controller namespace, and renaming it is a separate cosmetic decision.
- **Docblock in `User\RequestEmailChangeAction.php`** was already updated in #581 to point at `User\EmailChangeController::requestChange()` — no further drift to fix.

## Out of scope

- Renaming the `tests/Feature/Account/` directory.
- Renaming the Actions themselves (e.g. `RequestEmailChangeAction` → `RequestEmailChangeOnSelfAction`).
- Anything beyond the 4 file moves and their 5 import updates.

## Test plan

- [x] `vendor/bin/php-cs-fixer fix` — clean
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — `[OK] No errors`
- [x] `vendor/bin/pest tests/Feature/Account tests/Feature/Auth/EmailVerificationTest.php` — 30 tests pass (115 assertions)
- [x] `grep -r "App\\Actions\\Account\|App\\Http\\Requests\\Account" server --include='*.php' | grep -v vendor` — zero matches
- [ ] CI green (phpstan + cs-fixer + pest --parallel + the Angular / OpenAPI / Worker jobs that don't touch this area)
- [ ] No URL changes — Cypress smoke (email-change) implicit-pass via routing

## Provenance

Out-of-scope follow-up note from PR #581 (which closed #579). Same `/graphify` cluster diagnostic. PR opened in parallel with #582 (the `<app-verify-page>` shared component extract) per the workflow-speed memory — "push PR → IMMEDIATELY start the next branch".
