## What

Closes #529. Rewrites `docs/mobile/twa-runbook.md` so it describes the actual `/.well-known/assetlinks.json` deployment — a static JSON file at `client/public/.well-known/assetlinks.json` served by Cloudflare Pages on the SPA origin — instead of the retired Laravel-routed, env-driven implementation.

## Why

`/.well-known/assetlinks.json` started life (v2.2.0, #503) as a Laravel route reading `TWA_PACKAGE_NAME` + `TWA_SHA256_FINGERPRINTS` from `.env`. v2.3.1 (#522) flipped it to a static file under `client/public/` because the Laravel session/CSRF middleware was breaking the unauthenticated Digital Asset Links fetch in production.

The README and the v2.3.1 sweep PR body were updated when Copilot caught the drift on PR #526 (commit 8b240e9). The TWA runbook itself, which is the operator-facing document M9 hands to whoever ships the APK, was missed — Copilot didn't surface it on that PR but it's the same drift. Anyone following the runbook today would `vim .env`, paste the fingerprint, restart the container, curl, get `200`, and then be confused when the prod file still serves whatever was committed to `client/public/`.

## How

- **Step 1 § fingerprint extraction** — replaced the "paste into `.env` + restart container + curl to verify" flow with "edit the JSON file + open a PR + Cloudflare Pages serves it on next deploy". Includes a sample of the JSON shape so the operator sees exactly what to commit.
- **Step 2 § Application ID** — the cross-reference now points at the JSON's `package_name`, not `TWA_PACKAGE_NAME`.
- **Step 4 § sideload troubleshooting** — dropped the "production API hasn't restarted since the env var was set" failure mode (no env var, no restart). Replaced with "Cloudflare Pages deploy hasn't completed yet" because that's the actual real-world cause now.
- **Step 5 § Play Console enrollment** — the second fingerprint (Play-managed key) goes into the `sha256_cert_fingerprints` array as a JSON edit, not appended to `TWA_SHA256_FINGERPRINTS`. Same PR-based flow.
- **Operating principles bullet 2** — rewrote the "restart the API after touching `TWA_SHA256_FINGERPRINTS`" rule. New rule: "edits ship through the standard PR pipeline, no backend route, no env var, no container restart" + a forward-pointer to #522 so a future operator doesn't re-introduce a backend route to "fix" the static file.

No code changes, no test changes — this is a documentation-only PR.

## Notes

- Spectral CI does NOT lint markdown — this passes the gates by default.
- `grep -n 'TWA_PACKAGE_NAME\|TWA_SHA256' docs/mobile/twa-runbook.md` returns zero matches after the change. The only remaining references in the file are intentional negations ("no env var", "env-driven Laravel route... retired in v2.3.1") that exist precisely so a future operator can't accidentally re-introduce the deprecated approach.
- README + sweep PR body already correct (fixed on #526) — left untouched.

## Test plan

- [x] `grep -n 'TWA_PACKAGE_NAME\|TWA_SHA256' docs/mobile/twa-runbook.md` — only intentional negation references remain.
- [x] `prettier --check` not relevant for `.md` (the Angular Prettier task only covers `client/`).
- [x] No code touched — PHPStan / PEST / Vitest / ESLint all unaffected.
- [ ] Operator manual smoke when the next person actually ships an assetlinks fingerprint update — runbook should walk them through editing the JSON file + opening a PR, NOT touching `.env`.
