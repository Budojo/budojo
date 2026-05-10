## What

Post-v2.3.2 tech-debt + docs cleanup sweep — the canonical checklist defined in `feedback_post_release_techdebt_sweep` (agent memory).

## Why

After every stable release, between the `main → develop` sweep and the next feature train, walk the checklist so small drifts don't accumulate. v2.3.2 was a small patch — most of the checklist comes back empty, which is itself a successful sweep outcome.

## How

### Code-level — ✅ checked, 1 finding

- `grep TODO/FIXME/XXX/HACK/BUG:` — 1 real hit. `server/app/Actions/User/CancelAccountDeletionAction.php` referenced the closed #223 umbrella as the tracking issue for the deletion-request email-link flow. Carved out the email-link work into the new `#545` follow-up; repointed the TODO comment.
- `grep @ts-expect-error / @ts-ignore / eslint-disable` — 2 hits, both legitimate (test-only `@ts-expect-error` with rationale, `eslint-disable-next-line no-unused-vars` for a destructure-to-omit pattern).
- `grep console.log/.debug` — 0 hits.
- `grep .skip(/.only(/.todo(` — 0 hits.
- `npm outdated` — TS 5.9.3 → 6.0.3 (major, out of scope).
- `composer outdated` — phpunit 12.5.24 → 13.1.8 (major, out of scope).
- Dead routes in `app.routes.ts` — none.

### Docs-level — ✅ checked, no drift

- Migrations since v2.3.1 — none. `docs/entities/*.md` doesn't need a refresh.
- HTTP-layer changes (Controllers / Resources / Requests) since v2.3.1 — none. `docs/api/v1.yaml` doesn't need a refresh.
- `docs/design/DESIGN_SYSTEM.md` vs `client/src/styles/budojo-{theme,variants}.scss` — no theme changes since v2.3.1.
- Root + server + client `CLAUDE.md` — file paths and route names verified against current code, no stale references.
- `.claude/gotchas.md` — re-read, no rules superseded by v2.3.2 changes.
- `docs/changelog/user-facing/v2.3.2.md` + the typed `Release` entry in `whats-new.component.ts` — both present, content matches the release.

### Memory-level — ✅ perfect parity

- 35 memory files, 35 `MEMORY.md` index entries — no orphans, no dangling pointers.
- Memory descriptions sampled — accurate.

### Project-board level — ✅ clean

- 0 stale issues with no activity ≥ 90 days.

## Notes

The deletion-request email follow-up (#545) is the only piece of in-flight scope this sweep surfaced. Files filed cleanly, sweep diff is a 4-line comment update.

## Out of scope

- Major dep bumps (TS 6, PHPUnit 13) — separate triage, separate PRs.
- Mobile UI polish bugs surfaced in the same conversation (profile pencil, age chip wrap, belt label wrap on iPhone) — being shipped in a separate `fix/mobile-polish-v2.3.2` PR; the sweep is for hygiene, not feature-grade UX fixes.

## References

- `feedback_post_release_techdebt_sweep` (agent memory) — canonical checklist
- #545 — new follow-up for the deletion email-link cancel flow
- v2.3.1 sweep was #526 for shape parity

## Test plan

- [x] PHPStan clean (`docker exec budojo_api … phpstan`)
- [x] No code-behavior change — comment-only diff
