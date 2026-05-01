<!--
  Default PR body shape for the budojo repo. The structure encodes the
  canonical body discipline from CLAUDE.md § PR Checklist for Claude —
  What / Why / How / optional Notes / optional Out of scope /
  References / Test plan. Delete sections that don't apply (Notes and
  Out of scope are optional); do NOT delete What / Why / How /
  References / Test plan.

  English only — git artifacts (PR bodies, commits, code comments) are
  in English even when the SPA copy itself is Italian. See CLAUDE.md
  § PR Checklist for Claude.

  Keep AI-attribution OUT — no "Generated with Claude Code", no
  "Co-Authored-By: Claude". See CLAUDE.md § PR Checklist for Claude,
  item 6 (and the cross-cutting rule #9 in § What Claude Should
  Always Do).
-->

## What

Closes #N. _One paragraph: what changes, what it closes._

## Why

_Why this change is worth making. Cite the canon (Krug / Norman / Laws of UX / Uncle Bob / MD3) where it applies — a canon citation is a valid argument on its own._

## How

_High-level approach. Bullet the surfaces touched. Link to specific files (`path/to/file.ts:line`) when scope warrants._

## Notes

_Optional — edge cases, deliberate exclusions, things reviewers should know. Delete if nothing surprising._

## Out of scope

_Optional — what this PR deliberately does NOT do, especially when reviewers might expect it to. Delete if everything in scope is in._

## References

- Closes #N
- Tracking: #X _(umbrella, if any)_
- Predecessor / related PRs: _(optional)_

## Test plan

- [ ] `./.claude/scripts/test-server.sh` (PHP changes) — phpstan + cs-fixer + pest green
- [ ] `./.claude/scripts/test-client.sh` (Angular changes) — prettier + lint + vitest green
- [ ] Cypress green in CI
- [ ] Manual smoke: _what to click + expected outcome_
