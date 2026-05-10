## What

Fixes a `tempnam()` leak in the pre-existing `format=zip` test in `server/tests/Feature/User/ExportUserDataTest.php`. The test was building the temp ZIP path as `tempnam(...).'.zip'`, which is the same anti-pattern Copilot flagged on PR #539's new tests. Filed as a follow-up because #539 was already merged when the issue surfaced.

## Why

`tempnam()` already creates a real file at the returned path. Appending a `'.zip'` suffix produces a second filename, the test writes the ZIP bytes to that second path, and the original empty tempfile created by `tempnam()` is never unlinked.

In a development run that's a couple of orphan empty files. In CI across hundreds of test runs, those temp files accumulate inside the runner's `/tmp`, and when CI containers re-use slots between PRs the leak becomes a slow-burn disk-fill issue. Cheap to fix; expensive to leave alone.

The new tests added in PR #539 already use the correct pattern. This brings the existing test up to the same canonical:

- Open the ZIP at the `tempnam()`-returned path directly (no suffix).
- Add an explicit `expect($tmp)->toBeString()` check so a `false` return from `tempnam()` fails the assertion clearly instead of cascading into a confusing `file_put_contents` error.

The `ExportController` itself uses the same in-place discipline (see `buildZipResponse` line ~66 in `server/app/Http/Controllers/User/ExportController.php`), so the test now mirrors the production path.

## How

Single 6-line edit in `server/tests/Feature/User/ExportUserDataTest.php` lines ~85-93:

- Comment expanded to explain why the in-place approach matters.
- `$tmp = tempnam(...) . '.zip';` → `$tmp = tempnam(...);` + `expect($tmp)->toBeString();`.

No other test touched. No production code touched.

## Notes

- **Why a separate PR rather than amending #539** — #539 was already merged at the time Copilot's note about the existing-test pattern came in. Cleaner to ship the cleanup as its own commit history than to backport.
- **Test-only PR** — gates run end-to-end but no production behavior changes; PHPStan / PEST / Vitest / Cypress / OpenAPI lint all pass on develop and continue to pass with this change.
- **Promised in #539's reply** — when I told Copilot the existing-test fix was "out of scope on this tests-only PR but the new pattern is the canonical going forward", this is the canonical going forward.

## Test plan

- [x] `pest tests/Feature/User/ExportUserDataTest.php --filter='format=zip'` — 9 assertions pass (was 8; +1 from the new toBeString check).
- [x] Whole `ExportUserDataTest.php` runs clean — assertions on the original test, the medical-cert ZIP test, the orphan-binary test, the throttle, and the unauthenticated-401 all pass.
- [x] No production code touched — `app/` analyses unaffected; PHPStan stays clean.
- [ ] CI green on this PR (PHPStan + PEST + Vitest + Cypress + OpenAPI lint).
