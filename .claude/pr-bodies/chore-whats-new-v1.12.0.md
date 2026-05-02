## What

User-facing release notes for **v1.12.0**, the next stable release. Adds the canonical markdown source under `docs/changelog/user-facing/v1.12.0.md` and prepends the matching typed `Release` entry to `whats-new.component.ts`, in lock-step per `CLAUDE.md` § User-facing changelog (#254).

## Why

CLAUDE.md mandates that every stable release ships its user-facing changelog **before** the release PR is opened — the typed `Release` array drives `/dashboard/whats-new`, and the vitest spec pinning the version order in that array fails when an entry is missing (the regression-catching trip-wire by design).

## Scope of v1.12.0 (per `git log v1.11.0..origin/develop`)

Seven commits land on main with this release. Two flagship user-visible themes:

- **🌍 Italian translation across the dashboard** — the full PR-C umbrella (#279) shipped in five slices:
  - PR-C1 Profile (#337)
  - PR-C4 Documents — expiring list + widget (#338)
  - PR-C3 Attendance — daily check-in + monthly summary + widget (#339)
  - PR-C5 Academy — detail + form + training-days picker (#340)
  - PR-C2 Athletes list — list page only; detail + form deferred (#341)
- **🚪 Public landing page at /** (#330, #331) — root URL serves a public marketing page; logged-in users still go straight to the dashboard.

Internal-only commit (not surfaced in user-facing changelog):
- `41c118a` — multi-viewport Cypress coverage sweep (#336).

## How

- `docs/changelog/user-facing/v1.12.0.md` — written in plain English with light emoji on section headings, two sections (🌍 IT translation, 🚪 landing page), follows the established voice (sentence-case, second-person, no jargon).
- `whats-new.component.ts` — prepended a `Release` entry with the same headline + 2 sections + 6 bullets, matching the markdown content. Date `2026-05-02`.
- `whats-new.component.spec.ts` — updated the order pin (9 → 10 cards, `v1.12.0` at the top) so the order test fails the next time someone forgets to prepend.

## Test plan

- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest 420/420 green
- [x] Spec pin asserts `v1.12.0` is the first card and the array length is 10
- [ ] CI green
- [ ] Manual smoke: `/dashboard/whats-new` → top card reads "v1.12.0 — 2026-05-02" with the IT-translation + landing-page sections.

## References

- Tracking: #254 (User-facing What's new page)
- CLAUDE.md § "User-facing changelog (#254)"
