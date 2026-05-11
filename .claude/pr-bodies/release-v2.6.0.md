## Release v2.6.0

Promotes 8 betas (`v2.6.0-beta.1` through `v2.6.0-beta.8`) to stable. Headline: stronger sign-in security + a calmer dashboard surface + a hard compliance win on medical certificates.

## Merged this train

- #566 **#412 — TOTP 2FA + backup codes** — opt-in two-factor on `/dashboard/profile`, QR enrolment, 8 single-use backup codes, login challenge step.
- #567 **#424 — "Getting started" onboarding checklist** — 5-step card at the top of `/dashboard/athletes`, self-dismisses on completion or explicit dismiss.
- #568 **#418 — In-app notification center** — bell icon in the dashboard topbar, 20-row dropdown, per-row + bulk read.
- #569 **#537 — Medical-cert 24-month retention cron** — daily 03:15 Europe/Rome sweep; same `DeleteDocumentAction` the athlete-removal cascade uses.
- #570 **#431 — API tokens UI** — abilities-scoped Sanctum tokens with plaintext-once dialog and optional expiry.
- #571 **#224 — AES-256-GCM at-rest encryption** — new medical-cert uploads encrypt in memory before disk; key rotatable independently of `APP_KEY`.
- #572 **#419 — Web Push subscription backend** — `push_subscriptions` table + 3 endpoints + VAPID config; SPA toggle + delivery integration land in focused follow-ups.

## Discipline

- semantic-release reads the conventional commits since `v2.5.0`; minor bump → **v2.6.0**.
- Merge with **"Create a merge commit"** (NOT squash) per the release-PR discipline — squash would break the develop sync bookkeeping.
- Post-merge: semantic-release tags + the auto-sweep `chore/sync-main-into-develop-after-v2.6.0` PR opens itself; merge that with a merge commit too.
- User-facing changelog at `/dashboard/whats-new` already updated (#573, merged moments ago).

## Production checklist before merging

- [ ] `DOCUMENT_ENCRYPTION_KEY` set in Forge env (required for the medical-cert at-rest encryption to actually engage; an unset key silently falls back to plaintext, which is the safe default but defeats the purpose).
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` set in Forge env if Web Push is meant to enable on this deploy; otherwise leave blank and the controller returns 503 on subscribe.
- [ ] Forge `$RESTART_QUEUES()` macro fires after `$ACTIVATE_RELEASE()` (existing deploy script; verify) — new Notification / Job classes from #418 and #419 won't autoload through a stale queue worker otherwise.

## Test plan

- [x] Every PR in the train shipped with full TDD coverage (PEST + Vitest), Copilot review resolved, OpenAPI + entity-doc updates, EN+IT i18n lock-step.
- [x] `/dashboard/whats-new` page updated and pinned by the trip-wire spec (cards.length 29, v2.6.0 leads).
- [ ] Smoke on staging after merge: 2FA enrolment, checklist visibility for a new owner, bell on the topbar, API token mint round-trip, medical-cert upload + download decrypt loop.
