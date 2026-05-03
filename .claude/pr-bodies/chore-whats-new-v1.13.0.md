## What

Adds the user-facing changelog entry for `v1.13.0` (the train semantic-release will tag when develop ships to main next). Two artefacts in lock-step per the documentation discipline:

- `docs/changelog/user-facing/v1.13.0.md` — the canonical markdown source
- `client/src/app/features/whats-new/whats-new.component.ts` — the typed `Release[]` array prepended with the v1.13.0 entry, so the in-app `/dashboard/whats-new` page surfaces it on first load after the deploy

## Why

Per `CLAUDE.md` § "User-facing changelog (#254)" and the `feedback_release_whats_new_lockstep` memory: every release must update the What's new page in a chore branch BEFORE the develop→main release PR. Without this, `whats-new.component.spec.ts` (the regression trip-wire pinning the version order) fails on the release PR and the SPA goes out without a v1.13.0 entry surfaced to logged-in users.

## Headlines for v1.13.0

This train is the **completion** of the v1.12.0 i18n work. v1.12.0 covered the dashboard pages users open day-to-day; v1.13.0 finishes the surfaces that were still hardcoded:

- **Athlete detail tabs** (Documenti / Presenze / Pagamenti / header) — column headers, button labels, tooltips, empty states, day-cell aria, prev/next-month buttons all now in IT
- **Athlete form, every label and validation** — Nome / Cognome / Telefono / Cintura / Stato + the address fieldset + every inline validation error
- **Belt / status / country-code dropdowns** — reactive on language toggle (no page refresh required)
- **Sidebar `nav.academy` IT bug** — was reading "Academy" instead of "Accademia"; fixed in #354

Plus two behind-the-scenes items:

- The semantic-release `hotfix:` commit-type drift fixed in #352 (configuration-only, but worth a footnote so the team knows future hotfix-prefixed commits will tag correctly)
- The Angular ecosystem + jsdom dep refresh from #359 (no observable behaviour change)

## How

- New `docs/changelog/user-facing/v1.13.0.md` written in the same conversational, founder-voice register as the existing v1.x entries (light emoji on section headings, sentence-case bullets, IT examples for the IT-translated copy)
- `WhatsNewComponent.releases` array prepended with the matching typed entry
- `whats-new.component.spec.ts` regression trip-wire updated: latest version → `v1.13.0`, total count 10 → 11

## References

- Implements `feedback_release_whats_new_lockstep` (chore branch BEFORE the release PR — this is that chore)
- Companion to the upcoming `release: v1.13.0` PR (develop → main, merge commit per `project_release_merge_style`)

## Test plan

- [ ] CI green on the PR
- [x] `whats-new.component.spec.ts` parity check passes (latest = `v1.13.0`, 11 cards)
- [x] Vitest 420/420 + ESLint clean locally
- [ ] On the deployed `v1.13.0` release: `/dashboard/whats-new` opens with the v1.13.0 card on top, the headline + two sections render in the same Apple-minimal style as the existing entries
