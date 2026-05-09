## What

Post-v2.3.1 tech-debt + docs sweep. Catches drift between code shipped since the last sweep (post-v2.0.0, PR #485, 07 May) and the documentation surfaces.

Two real findings; the rest of the canonical checklist (code-level greps, npm/composer outdated, dead routes, memory index parity, project-board stale-issue triage) ran clean.

## Why

The post-release sweep is mandatory between a stable release and the next feature train (root `CLAUDE.md` § Post-release tech-debt sweep). Without it small drifts accumulate — a TODO that no longer reflects the code, an API doc that lies about validation, a README roadmap stuck two milestones back. Each one tiny, together they're slow rot.

Since the last sweep we shipped v2.1.0 (HIBP password-breach check #415), v2.2.0 + v2.3.0 + v2.3.1 (M9 mobile / Android TWA groundwork — assetlinks route, PWA manifest TWA-readiness, runbook). Two surfaces drifted from that work.

## How

### Finding 1 — `docs/api/v1.yaml` was silent on the HIBP breach check

PR #487 (v2.1.0) added `App\Rules\PasswordNotBreached` to four FormRequests (Register, ChangePassword, ResetPassword, AcceptAthleteInvitation), introducing a new 422 failure code (`errors.password[0] = "password_breached"`) the SPA can render an actionable message for. None of the six surfaces in `v1.yaml` mentioned it; one (`/me/password` description) explicitly contradicted reality with "policy mirrors registration: `min:8` + `confirmed`".

Six edits, all under `docs/api/v1.yaml`:

- `RegisterRequest.password` schema — added a `description:` block describing the policy + the `password_breached` error code + the soft-fail-on-upstream-outage behaviour.
- `ResetPasswordRequest.password` schema — same shape, references RegisterRequest as the canonical policy.
- `ChangePasswordRequest.password` schema — same.
- `/auth/reset-password` operation description — extended the "Form-level validation" branch to mention the breach-check failure mode.
- `/me/password` operation description — fixed the stale "policy mirrors registration: `min:8` + `confirmed`" line to include the breach check.
- `/athlete-invite/{token}/accept` request body password — added a `description:` block matching the rest.

### Finding 2 — root `README.md` roadmap stuck at M6

The "What's live right now" table didn't reflect the M7 athlete-login surface that's been shipping (PR-A through PR-D-minimal — `users.role` enum, invite-only flow, role-aware guards, athlete-portal landing) or the M9 mobile/TWA work just shipped over the last 24 h. The Roadmap section ended at M6.

- "What's live" table — refreshed the Authentication row to mention the HIBP breach check; appended an "Athlete login (M7)" row marked 🚧 In flight; appended a "Document AI (M8)" row 📋 Planned and a "Mobile / Android TWA (M9)" row 🚧 In flight describing what shipped (manifest, assetlinks, runbook) vs what's next (Bubblewrap APK, Play Console).
- "Roadmap" section — added M7, M8, M9 entries with PRD / runbook links and explicit V1-vs-V2 scope notes.

### Checklist outcomes (no-finding entries)

- **Code-level greps** — `TODO/FIXME/XXX/HACK/BUG:` (1 real hit, justified by issue link in #223 follow-up comment), `@ts-expect-error / @ts-ignore / eslint-disable` (2 hits, both with rationale), `console.log/warn/error/debug` (5 hits, all in `stale-chunk-recovery.ts` + `main.ts` bootstrap — intentional error-path signals), test markers (`.skip / .only / .todo` — none).
- **`npm outdated`** under `client/` — only `typescript 5.9.3 → 6.0.3` (major bump; Angular 21 likely lags it; out of sweep scope).
- **`composer outdated --direct`** under `server/` — only `phpunit 12.5.24 → 13.1.8` (major; PEST 4 still pins 12; out of scope).
- **Dead routes** in `app.routes.ts` — clean, every route reachable from sidebar / sitemap and each carries a rationale comment with issue link.
- **Memory index parity** — 34 memory files, 34 lines in `MEMORY.md`, no orphans, no dangling pointers, every `description` matches body.
- **Project-board stale issues** — query for `updatedAt < now - 90d` returns empty (all open issues active in the last 30 days).
- **Spectral** — `npx @stoplight/spectral-cli@6 lint docs/api/v1.yaml` exits 0 with 6 pre-existing warnings (5 attendance-tag + 1 unused VerificationRequired component) — unrelated to this PR.

## References

- Closes nothing — sweep PRs don't close issues, they're hygiene runs.
- Last sweep: PR #485 (post-v2.0.0).
- Code surface that triggered Finding 1: PR #487 (HIBP — issue #415).
- Code surface that triggered Finding 2: PRs #514, #516, #517, #520, #522 (M9 TWA train) + the M7 PR-A→D-minimal series.

## Test plan

- [x] `python3 -c "import yaml; yaml.safe_load(open('docs/api/v1.yaml'))"` — parses.
- [x] `npx @stoplight/spectral-cli@6 lint docs/api/v1.yaml` — exit 0, 0 errors.
- [x] `git diff --stat` — 51 lines changed across 2 files, no spurious style churn.
- [ ] CI green on this PR (PHPStan / PEST / Vitest / Cypress / OpenAPI lint).
