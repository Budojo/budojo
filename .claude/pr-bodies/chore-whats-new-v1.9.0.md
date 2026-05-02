## What

Backfills the user-facing changelog entry for the upcoming **v1.9.0** stable. Lock-step pair as required by the `CLAUDE.md` § "User-facing changelog (#254)" discipline:

- `docs/changelog/user-facing/v1.9.0.md` — markdown source.
- `client/src/app/features/whats-new/whats-new.component.ts` — typed `Release` entry prepended to the array.

Spec assertions in `whats-new.component.spec.ts` updated for the new card count (6 → 7) and the new newest-first version order (`v1.9.0` is now first).

## Why

Every `develop → main` release ships the in-app "What's new" page in lock-step with the markdown changelog. Without this PR the release would land with `v1.9.0` on the tag but `v1.8.0` still showing as the latest entry on `/dashboard/whats-new` — exactly the regression the vitest spec is designed to trip.

Goes in **before** the release PR per the post-release tech-debt sweep convention.

## Headline beats covered

- 🌍 **i18n on auth + setup + chrome + 404** — delivers on the v1.8.0 promise ("we'll bring Italian translations to the dashboard pages in the next release"). #278 / #297.
- 🌍 **Privacy default flipped to English** — `/privacy` cold-load now lands on the English version. #291 / #292.
- 🥋 **Athletes Edit moved into the detail page as a subtab + folder icon dropped from list** — #281 / #298.
- 🥋 **"Paid" column header writes the current month** — #282 / #289.
- 🛡️ **Profile "Your data" card stacks vertically** — #284 / #290.

Internal-only changes since v1.8.0 (`docs(claude)`, `chore(scripts)`, `fix(i18n)` Copilot review on the v1.8.0 release PR, the `chore(scripts)` grep fix on the test runner) intentionally not surfaced — they're invisible to a user reading the dashboard.

## How

- Markdown file follows the same shape as the prior six (`v1.3.0` … `v1.8.0`) — H1 headline, italic intro paragraph, emoji-led `##` section headers, prose bullets in second person.
- Typed array entry mirrors the markdown 1:1 (no markdown parser dependency by design — see the `WhatsNewComponent` docblock).
- Spec card count assertion bumped 6 → 7; version-order array prepended with `'v1.9.0'`.

## Tests

- `bash .claude/scripts/test-client.sh` — prettier clean (1 file rewritten by prettier on first run, idempotent after), lint clean, vitest 380 → 380 (all pass; the spec assertions changes track the new card).

## Out of scope

- The actual `develop → main` release PR — separate PR, opens immediately after this one merges.

## Test plan

- [x] `bash .claude/scripts/test-client.sh` — all three gates green.
- [x] Vitest pinning specs (`renders the title and the latest release at the top` + `renders every shipped release in newest-first order`) updated to expect `v1.9.0` first and 7 cards total.

## References

- Closes the lock-step gap before the v1.9.0 release PR (see CLAUDE.md § "User-facing changelog (#254)").
- Predecessor release PRs (same shape): #275 (v1.8.0), #263 (v1.7.0).
