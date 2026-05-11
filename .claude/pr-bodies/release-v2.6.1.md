## What

Stable release PR develop → main for **v2.6.1**. semantic-release will auto-tag `v2.6.1` and create the GitHub Release on this PR's merge commit.

## What's in this train (since v2.6.0)

**1 user-visible UX fix:**
- `🐛 fix(client): bind verify-error resend button to sending() signal (#586)` — closes #585. The "Resend verification email" button on `/auth/verify-error` now shows a spinner and disables itself during the HTTP request. The TS-side `sending()` re-entrancy guard was already blocking the double-fire silently; this PR adds the visible feedback.

**3 internal refactors (no user-visible change):**
- `♻️ refactor(server): move EmailChangeController out of Account/ namespace (#581)` — closes #579.
- `♻️ refactor(client): extract <app-verify-page> shared chrome (#582)` — closes #580. Three verify landing pages now delegate their chrome to a single shared component with a `warning` state preserving verify-error's amber color (semantic distinct from `verify-email-change`'s terminal red).
- `♻️ refactor(server): split App\Actions\Account/* by consumer (#584)` — closes #583. Actions + form request redistributed to `User\` / `Auth\`; `Account/` namespace removed entirely (controllers were already moved in #581, this finished the layer).

**5 new Vitest specs for previously-untested Angular components** (slices of umbrella #588, 35+ tests added):
- `🧪 test(client): VerifySuccessComponent (#589)`
- `🧪 test(client): VerifyErrorComponent (#590)`
- `🧪 test(client): AthletePortalWelcomeComponent (#591)`
- `🧪 test(client): NotificationBellComponent (#592)`
- `🧪 test(client): AthleteInviteComponent (#593)`

**2 internal docs + 1 chore:**
- `🔧 chore: integrate graphify knowledge graph into dev workflow (#578)` — agent-side `/graphify` slash command, post-commit hook keeps the graph current, root CLAUDE.md rule directs future sessions to consult the graph before touching unfamiliar code.
- `📝 docs(gotchas): audit per-consumer customisations when extracting shared component (#587)` — captures the visual-regression Copilot caught on #582 (amber→red on verify-error before the `warning` state fix).
- `📝 docs(gotchas): don't use test-*.sh quick on first commit of new files (#594)` — captures the local-pass-CI-fail trap that fired 3 times in this session.

**Pre-release prep:**
- `🔧 chore(release): add v2.6.1 to What's new (#595)` — markdown + typed Release entry + spec update for the user-facing changelog.

## Why v2.6.1 (not v2.7.0)

semantic-release reads conventional-commit prefixes: 1 `fix:` since v2.6.0 → patch bump. The beta-tag train already confirmed: `v2.6.1-beta.1` was published when #586 landed.

## Notes

- **MUST merge via "Create a merge commit"**, NOT squash (per `project_release_merge_style.md` memory — squash breaks downstream merge bookkeeping for the post-release `main → develop` sync job).
- The post-release sweep workflow opens the `chore/sync-main-into-develop-after-v2.6.1` PR automatically once this PR's merge commit lands on main. With the bot token + auto-merge enabled, it self-merges once its own CI clears.
- v2.6.1's user-facing surface is small (one resend-button spinner). The bulk is internal hardening. This is the right cadence for a patch release.

## Test plan

- [x] develop's CI has been green per-PR through this entire train (all 12 sub-PRs merged green).
- [x] User-facing changelog v2.6.1.md ships in lockstep with the typed `Release` entry in `whats-new.component.ts`; the order-pinning vitest spec asserts both `'v2.6.1'` at index 0 and `length === 30`.
- [x] No URL changes; no migration; no breaking API change.
- [ ] semantic-release tags `v2.6.1` on merge.
- [ ] Sweep job opens + self-merges `chore/sync-main-into-develop-after-v2.6.1`.

## Provenance

User-triggered release call: "fai rilascio quando ritieni opportuno". Marathon session of refactor + test + docs work since this morning, cut at a natural stopping point.
