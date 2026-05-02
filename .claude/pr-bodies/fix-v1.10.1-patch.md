## What

Patch for **v1.10.1**. Three Copilot catches from the v1.10.0 release PR (#314) + two findings from the first production run of the auto-sweep workflow.

## Why

Each catch is small in isolation but they all touch release-flow plumbing — bundled into one patch so v1.10.1 ships the entire post-mortem rather than three separate trains.

## How

### `feat(feedback)` follow-up

- `server/resources/views/emails/feedback.blade.php` — every user-supplied / server-derived field now uses `{!! ... !!}` instead of `{{ ... }}`. Blade's default `{{ }}` calls `htmlspecialchars` regardless of Mailable Content-Type, so a user typing `Athletes & sorting < broken` would land in the owner's inbox as `Athletes &amp; sorting &lt; broken`. The unescaped form is safe here because (a) `Content-Type: text/plain` — no HTML interpretation client-side, (b) recipient is hardcoded (the owner), so even a misbehaving client renders it as literal text. Inline blade-comment in the template explains the choice.

### `docs(api)`

- `docs/api/v1.yaml` — `- name: feedback` added to the top-level `tags:` list. Spectral flagged `operation-tag-defined` as a warning on every `/feedback` endpoint run since v1.10.0 — not blocking but correct.

### `ci(release)` — auto-sweep workflow

- `.github/workflows/post-release-sweep.yml`:
  - Trigger switched from `release: published` → `push: tags: ['v*.*.*', '!v*-beta*']`. GitHub Actions refuses to fire downstream workflows on `release.published` events created by `GITHUB_TOKEN` (a documented recursion safeguard); semantic-release publishes via that token, so the original trigger never fired in production (caught on the v1.10.0 release).
  - Tag push events DO fire under `GITHUB_TOKEN`. The glob filter limits to stable tags; the `!v*-beta*` line excludes beta tags from the develop train.
  - Dropped the `target_commitish == 'main'` `if:` guard — redundant once the trigger is constrained to `v*.*.*` (tag protection upstream ensures only main-merged commits can carry these tags) and undefined under `push` events anyway.
  - `Resolve tag` step reads `github.ref_name` for `push` events (the new context for the tag name) instead of `github.event.release.tag_name`.
  - Inline PR-body wording adjusted to "tag push" instead of "release published".

### `docs(claude)` — release-flow notes

- Root `CLAUDE.md` § Release Flow now calls out the **two prerequisites** for the auto-sweep workflow:
  1. The repo-level setting *Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"* must be enabled. Without it, `gh pr create` from the workflow fails with `GitHub Actions is not permitted to create or approve pull requests`. Caught on v1.10.0 — one-time admin toggle.
  2. The trigger is `push: tags`, not `release: published`. Documented inline so the next person reading the workflow doesn't second-guess it.

## Out of scope (rejected Copilot catch)

Copilot's #314 review also flagged the heredoc body in `post-release-sweep.yml` as "indented → renders as a Markdown code block". Verified false positive by inspecting the v1.10.0 manual run's logged script: YAML's `|` block strips the common leading indent before passing the script to `bash`, so the heredoc body lands at column 0 in the resulting file. Not changing.

The bash quoting catch (`echo "spec=$(IFS=,; echo "${SHARD_SPECS[*]}")"`) was also rejected on the original PR thread — `$()` opens a new quoting context, so the nested `"..."` don't terminate the outer string. Verified empirically across PRs #310, #312, #313, #314 — every shard ran its assigned spec list cleanly.

## Test plan

- [x] `./.claude/scripts/test-server.sh` — phpstan + cs-fixer + pest 301/301 green
- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest 402/402 green
- [ ] Cypress green in CI
- [ ] Manual smoke once v1.10.1 ships: send a feedback message containing `&` and `<` from `/dashboard/feedback`, verify the owner's email shows the literal characters (NOT `&amp;` / `&lt;`)
- [ ] First production fire of the new `push: tags` trigger will be on the v1.10.1 stable tag itself — verify the auto-sweep PR opens (assuming the repo setting is flipped on)

## References

- v1.10.0 release PR: #314 (Copilot catches)
- Auto-sweep workflow: #309
- In-app feedback: #311 / #312
- Release flow: CLAUDE.md § Release Flow
