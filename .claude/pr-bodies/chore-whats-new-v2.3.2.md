## What

Pre-stages the **user-facing What's New entry for the upcoming v2.3.2** so tomorrow's release PR doesn't have to do it in lock-step. Three artefacts in the standard layout per `CLAUDE.md` § "User-facing changelog (#254)":

- `docs/changelog/user-facing/v2.3.2.md` — markdown source.
- `client/src/app/features/whats-new/whats-new.component.ts` — typed `Release[]` entry prepended at index 0.
- `client/src/app/features/whats-new/whats-new.component.spec.ts` — order-pin test updated (26 cards now; first card `v2.3.2`; second card `v2.3.1`).

## Why

The repo discipline is "every release prepends a What's New entry in a chore branch BEFORE the release PR". Doing it now lets tomorrow's `develop → main` release PR be a single-purpose merge instead of bundling content drafting with the release machinery.

The version derives from semantic-release's conventional-commit rules: since the v2.3.1 tag we shipped only `fix:` (#528 attendance pagination, #535 privacy backup claim) and `chore`/`docs`/`test` commits — no `feat:`. So the next stable is `v2.3.2` (patch). The two `fix:` PRs were already in the `v2.3.2-beta.X` train on develop.

## How

The customer-facing summary covers the eight PRs that landed in the v2.3.2 cycle:

**Visible to users** (the two `fix:` items get top billing):

- **#528 attendance pagination** — Luigi reported that `/dashboard/attendance` sort-by-belt was hiding most of the roster. Fixed with server-paginated 20-per-page slicing + paginator chrome + auto-reset to page 1 on filter / search / sort change.
- **#535 privacy policy backup claim** — corrected the inaccurate "daily database backups with 30-day retention" claim. New wording aligns with what the DPA template § 8 + production-deployment runbook already say: "an automated database-backup plan planned to be implemented before any real production customer data is collected."

**Invisible to users** (one section, multiple bullets):

- **#533 DPIA-lite for medical certificates** — `docs/legal/dpia-medical-certificates.md`, with the strategic A-vs-B option laid out for the user to pick.
- **#536 academy-offboarding runbook** — `docs/operations/academy-offboarding.md`, three-window manual procedure (T-30 / T0-T+30 / T+30).
- **#530 TWA runbook rewrite** — describes the actual static-file `assetlinks.json` flow instead of the retired Laravel-routed env-driven approach.
- **#532 Play Store listing copy** — EN + IT, with Data Safety questionnaire answers, paste-ready for Play Console.
- **#539 medical-cert test coverage** — pins GDPR Art. 15 export + Art. 17 erasure handling with explicit `DocumentType::MedicalCertificate` shape.

The `#526 techdebt sweep` is already in the v2.3.2-beta train but doesn't surface in the user-facing entry (pure internal hygiene, nothing customer-visible).

## Notes

- **Voice mirrors v2.3.1 / v2.3.0 / v2.2.0** — chatty, second-person, explicit Luigi callout, light emoji on section headings (🐛 / 🔧). The user wrote those entries; this entry stays in their voice.
- **No breaking changes** — patch release, all the bullets are bug fixes or invisible compliance/docs work.
- **Markdown ↔ typed array lock-step** — content is hand-tailored to each surface (markdown is the citable source with full prose; the typed array gives Angular full design control over typography). The two ARE NOT auto-generated from each other; they're written together. The order-pin spec catches a forgotten array prepend; this PR exercises that exact path.
- **Release PR follow-up** — when this merges to develop, the user can open the `develop → main` release PR (merge commit, NOT squash, per memory) and semantic-release tags `v2.3.2` automatically.

## Test plan

- [x] `docs/changelog/user-facing/v2.3.2.md` exists, renders as markdown, references the right PRs.
- [x] `whats-new.component.ts` releases array has v2.3.2 at index 0 with date 2026-05-10.
- [x] `whats-new.component.spec.ts` order-pin asserts 26 cards starting with v2.3.2 then v2.3.1; full Vitest run reports 713 tests passing.
- [x] `npm run lint` — clean.
- [x] `prettier --check` — clean.
- [x] No backend changes — PHPStan / PEST untouched.
- [ ] Visual smoke on `/dashboard/whats-new` — defer to the user's morning preview before the release PR ships. (Cypress E2E in CI exercises the route.)
- [ ] Release PR (`develop → main`, merge commit per memory `project_release_merge_style.md`) gets opened by the user once they're awake.
