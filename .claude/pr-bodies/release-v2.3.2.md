## What

Promotes the `develop` branch to `main`, triggering semantic-release to tag **v2.3.2** (patch bump driven by the two `fix:` commits from #528 and #535) and publish a stable GitHub Release.

## Headline

A two-fix release plus a wave of behind-the-scenes legal-docs hardening.

1. **Attendance — sort-by-belt no longer hides the rest of the roster** (#528, Luigi's report). On `/dashboard/attendance` with > 20 active athletes, sorting by belt was silently dropping every belt above white because the page had no paginator and the per-page slice exhausted itself on the white-belt cohort. Fixed: server-paginated 20-per-page slicing, paginator chrome under the table when there's a second page, and an automatic snap-back to page 1 on every filter / search / sort change so a narrowing filter can't leave you on a phantom empty page.

2. **Privacy policy — "daily backups" claim corrected** (#535). The bullet under § 5 used to say "Daily database backups with 30-day retention" / "Backup giornalieri della base dati con retention 30 giorni". That was stronger than reality — the automated backup strategy is documented as an explicit prerequisite for real production customer data but isn't yet active. Reworded to "an automated database-backup plan planned to be implemented before any real production customer data is collected" (and the IT equivalent), pointing at the DPA template § 8 + production-deployment runbook for the technical decision (DigitalOcean Managed DB vs `mysqldump` cron vs droplet snapshots) that's still being made. Transparency-improvement, not a security regression.

Behind the scenes (invisible to users):

- **DPIA-lite for medical certificates** (#533) at `docs/legal/dpia-medical-certificates.md` — Art. 35 GDPR-style risk assessment with the strategic A-vs-B option fully fleshed out (keep PDFs in Budojo with encryption + audit log + DPO vs metadata-only + customer's own storage). Recommendation: option B until traction; the choice itself is still pending in § 8.
- **Academy-offboarding runbook** (#536) at `docs/operations/academy-offboarding.md` — the manual procedure for when an academy customer ends the contract, three windows (T-30 notice, T0-T+30 grace export, T+30 purge), real-schema-aligned cascade walk after Copilot caught fabrications.
- **TWA runbook rewritten** (#530) — the operator-facing assetlinks.json deployment now describes the actual static-file flow under `client/public/.well-known/` served by Cloudflare Pages, instead of the env-driven Laravel route deprecated in v2.3.1.
- **Play Store listing copy** (#532) at `docs/mobile/play-store-listing.md` — EN + IT short and full descriptions, the Data Safety questionnaire answers, paste-ready for Play Console once the keystore + Bubblewrap APK ship.
- **Medical-certificate test coverage** (#539, #541) — pinned the GDPR Art. 15 (export ZIP includes the binary) + Art. 17 (PurgeAccountAction wipes the file from disk) handling, plus a `tempnam()` leak fix in the pre-existing `/me/export` ZIP test.
- **Post-v2.3.1 tech-debt sweep** (#526) — OpenAPI spec caught up with the HIBP password-breach check shipped in v2.1.0, README roadmap refreshed for M7 / M8 / M9 status.

## What's New

User-facing changelog entry pre-staged in #540 — markdown at `docs/changelog/user-facing/v2.3.2.md`, typed `Release[]` entry prepended in `whats-new.component.ts`, vitest order-pin and Cypress visibility spec updated in lock-step. The page at `/dashboard/whats-new` will render v2.3.2 as the top card the moment this PR lands.

## Closes

- #527 (attendance bug)
- #529 (TWA runbook drift)
- #534 (privacy policy backup claim)
- #538 (DPIA #227-b — medical-cert export+delete coverage)

Follow-up issues opened during this cycle remain open by design:

- #531 — Play Store visual assets (feature graphic + screenshots + icon, requires designer / running app)
- #537 — DPIA #227-a (cron retention for expired medical certs, gated on the A-vs-B decision in `docs/legal/dpia-medical-certificates.md` § 8)

## Merge style

**Merge commit** — NOT squash. The release flow needs the develop→main merge commit so `main` carries the full history; squashing breaks the post-release `main → develop` sync sweep's bookkeeping. (See `project_release_merge_style.md` agent-side memory + the Auto-sweep section of the root `CLAUDE.md`.)

## Test plan

- [x] `develop` is up-to-date with `main` (`git log origin/main..origin/develop` shows the 10 PRs).
- [x] Conventional-commit shape: 2 `fix:` + 5 `docs:` + 2 `chore:` + 1 `test:` since v2.3.1 → semantic-release computes patch bump → tags `v2.3.2`.
- [x] Beta train ran: latest beta tag is `v2.3.2-beta.2` (a third beta will fire on this PR's merge if the workflow's `develop` push handler triggers; the stable tag fires from the `main` push handler).
- [x] What's New entry, vitest order-pin, Cypress data-cy assertion all in lock-step (lock-step memory enforced via #540).
- [x] No backend behavior change other than the attendance-pagination fix in #528 (already in beta train since 2026-05-09).
- [ ] CI green on this PR.
- [ ] Copilot first-pass review (release PR follows the standard Copilot wait per `feedback_release_pr_wait_for_copilot.md`).
- [ ] After merge: semantic-release tags v2.3.2 stable; the in-workflow sweep job opens `chore/sync-main-into-develop-after-v2.3.2` and (with auto-merge enabled) merges itself.
