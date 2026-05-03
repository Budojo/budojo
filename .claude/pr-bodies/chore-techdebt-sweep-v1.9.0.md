## What

Closes #287. Inaugural run of the post-release tech-debt + docs sweep — originally scoped to v1.8.0 then widened to cover v1.8.0 + v1.9.0 since both shipped before the sweep ran.

## Findings

### Code-level — clean

- **1 TODO** in `server/app/Actions/User/CancelAccountDeletionAction.php` referencing #223 (the email-link cancel flow). Legitimate, no action.
- **1 `@ts-expect-error`** in `client/src/app/core/services/language.service.spec.ts` — boundary test exercising a narrow-typed public API. Intentional, no action.
- **0** `console.log` / `console.debug` across `client/src`.
- **0** `.skip` / `.only` / `.todo` markers across `client/src`, `cypress`, `server/tests`.

### Migrations / API — zero drift since v1.7.0

`git diff v1.7.0..HEAD -- server/database/migrations server/app/Http server/app/Resources` returns empty. v1.8.0 + v1.9.0 work was 100% client-side (i18n, UI fixes, layout polish, the athletes detail subtab restructure). No `docs/entities/*.md` or `docs/api/v1.yaml` updates needed.

### Docs — single drift fixed

- **`client/CLAUDE.md`** — added the **i18n hard rule** (ngx-translate framework + lock-step en/it JSON parity + `provideI18nTesting()` for component specs + Cypress `localStorage.budojoLang` override pattern + don't-build-keys-from-template-strings). Was missing despite the framework being load-bearing across auth + setup + chrome + 404 + privacy after #297. Plus a paragraph in the **PWA scaffold** section pointing at `AppUpdateService` (#305) so the auto-reload-on-new-version contract is documented next to the SW config that makes it necessary.
- `gotchas.md` (19 categories), root `CLAUDE.md`, `server/CLAUDE.md`, root + client + server READMEs all read clean — no stale commands, no stale paths, no stale rules.

### Routes — no dead routes

`app.routes.ts` walked end to end. Every path reachable via the sidebar (`/dashboard/athletes`, `/dashboard/academy`, `/dashboard/profile`, `/dashboard/whats-new`, `/dashboard/documents/expiring`, `/dashboard/attendance`, `/dashboard/attendance/summary`), per-athlete tabs (`/dashboard/athletes/:id/{documents,attendance,payments,edit}`), or public links (`/privacy`, `/privacy/it`, `/sub-processors`, `/auth/{login,register,verify-success,verify-error}`, `/setup`, `/404` wildcard).

### Memory — 1:1 parity

17 memory files in the agent's memory directory, 17 entries in `MEMORY.md` index. No orphans, no dead pointers.

### Project board

- **#273** closed earlier in this session (released in v1.8.0 / v1.9.0 — PR-A + PR-B both shipped).
- **#240** (multi-viewport) status unchanged — infra in `cypress/support/viewports.ts` is shipped, individual surfaces (form atleta, form academy, attendance, profile, login/register) still backlog. Keep open.
- **#271** (i18n epic) — current snapshot reflected by this sweep + the new `client/CLAUDE.md` rule.
- **#287** (this issue) — closed by this PR.

## Deps

### Patch bumps applied (this PR)

- `typescript-eslint` 8.59.0 → 8.59.1 (client dev dep)
- `laravel/framework` 13.5.0 → 13.7.0 (and pulled-in transitives: laravel/pail, laravel/sanctum, laravel/tinker, nesbot/carbon, nunomaduro/collision, nunomaduro/termwind, pestphp/pest-plugin-laravel)
- `nunomaduro/collision` 8.9.3 → 8.9.4
- `phpstan/phpstan` 2.1.50 → 2.1.54

### Major bumps deferred

Filed as **#306** for tracking. Skipped here because each major needs its own validation pass:

- `@angular/*` 21.2.9 → 21.2.11 (blocked: build/cdk/cli still at 21.2.9 latest, peer-dep resolver fails on partial bump)
- `cypress` 13 → 15
- `jsdom` 28 → 29
- `typescript` 5.9 → 6
- `phpunit` 12 → 13

## Tests

- `bash .claude/scripts/test-server.sh` — phpstan clean, cs-fixer clean, pest 290 / 914 assertions ✅ post-Laravel bump.
- `bash .claude/scripts/test-client.sh quick` — lint clean, vitest 380 / 380 ✅ post-typescript-eslint bump.

## Out of scope

- Major dep bumps — see #306.
- The SwUpdate auto-reload (#305) — separate PR, lands independently.
- The payments row-height (#304) — separate PR, already merged.
- Refactors / new features. Pure hygiene PR.

## References

- Closes #287.
- Tracking the deferred majors: #306.
- Memory rule: `feedback_post_release_techdebt_sweep.md` (agent-side).
