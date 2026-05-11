## What

One-paragraph addition to `.claude/gotchas.md` under a new section "Refactor / extracting shared components":

> Extracted `<app-verify-page>` chrome from `verify-success` (green), `verify-error` (**amber**), and `verify-email-change` (red) and collapsed all three coloured-icon variants to a single `--error` modifier in the shared SCSS → silently changed `verify-error`'s icon from amber to red. Visual regression Copilot caught on PR #582 (#580 refactor). Fix: introduced a dedicated `'warning'` state with the amber colour; `verify-error` now uses `state="warning"`, `verify-email-change` keeps `state="error"` for terminal-token red. **Rule:** when factorising N similar components into one shared component, sweep the per-instance customisations (colour tokens, animation timings, copy variations) into named states or explicit inputs, not into a "default that happens to match the first consumer I read". Three diffs → three side-by-side reads before designing the API.

## Why

`.claude/gotchas.md` is the living "don't repeat these mistakes" list. The CLAUDE.md ritual is to read it before every push; new entries land in the same PR that fixes the mistake (per the file's own preamble). The actual fix shipped in PR #582 — this PR just adds the entry that should have shipped with it (I missed the lockstep convention because the fix landed as a Copilot follow-up commit, not in the original push).

The rule (`Three diffs → three side-by-side reads before designing the API`) is the generalisable lesson: skim-reading 1-of-N consumers and assuming the rest are identical is the failure mode. The verify-error amber-vs-red was the cheap case (visual regression); the same shape can hide e.g. a different animation duration that breaks a specific consumer's UX, or a different `data-cy` that breaks a Cypress assertion only on one path.

## Out of scope

- Re-opening / amending PR #582 to slot the entry there — already merged, the file convention says "same PR that fixes the mistake" but a follow-up doc PR is the pragmatic alternative when the lesson is found post-merge.
- A broader sweep of past PRs for similar lessons.

## Test plan

- [x] `.claude/gotchas.md` reads as a self-contained paragraph next to the existing entries (same one-line-per-mistake style).
- [x] New section "Refactor / extracting shared components" sits naturally between "SCSS — same-element classes vs descendant selectors" and "Design system / PrimeNG precedence".
- [ ] CI: the docs change touches a single file under `.claude/` — only the format-lint job has any reason to run.

## Provenance

Surfaced by Copilot review on PR #582 (the `<app-verify-page>` extract that closed #580). Filed as docs-only follow-up to capture the lesson for the next refactor session.
