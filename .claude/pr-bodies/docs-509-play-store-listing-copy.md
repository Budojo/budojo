## What

Refs #509. Drafts the **textual portion** of the Play Store listing — short description (≤80 chars), full description (≤4000 chars), Data Safety questionnaire answers — in both English and Italian. New file: `docs/mobile/play-store-listing.md`.

The visual portion (feature graphic, icon, screenshots) is filed as a follow-up issue #531 and is intentionally NOT in this PR; #509 stays open until the visuals ship too.

## Why

M9 needs the Play Console listing populated before #510 (internal-testing track upload) can run. The listing copy + Data Safety form aren't a 30-minute "fill it in the console UI" job — they need to be drafted, reviewed, translated, and length-checked, and they're worth carrying as a doc in the repo so the next person who needs to update them doesn't start from scratch.

Splitting copy from visuals is deliberate: the copy is text-only and committable; the visuals need a running staging instance with realistic-but-not-real seed data + image editor + a brand-designer review for the feature graphic. Different workflows, different reviewers.

## How

`docs/mobile/play-store-listing.md` is the new source-of-truth document. Structure:

- **Length budgets table** at the top — Play's hard limits (App name 30, Short 80, Full 4000) so anyone editing the file knows what they're up against.
- **App name** — `Budojo`, both locales.
- **Short description** — 77 / 80 in both EN and IT (deliberate 3-char headroom against future tweaks). Each block is a fenced code box so character counts are unambiguous (Play Console enforces *character* budgets, not bytes — `len()` on the unicode string; non-ASCII like `è` and `—` would diverge if we counted bytes).
- **Full description** — 2337 / 4000 EN, 2488 / 4000 IT. Voice is folksy / second-person (Krug's "Don't Make Me Think" applied to listing copy — the store reader is a busy academy owner browsing on a phone). Five thematic sections: what you get / why mobile / what it costs / who built this / privacy. The privacy paragraph links the per-locale `/privacy` URL.
- **Privacy policy URL** — table mapping EN/IT listing locales to `/privacy` and `/privacy/it`.
- **Data Safety questionnaire** — full per-category answers keyed to Play's actual form fields. Three yes-answers worth flagging for review optics: health info (medical certificates), photos (avatars), and purchase history (the per-athlete monthly-dues ledger — `amount_cents` + month/year, NO card data). All three are user-provided / owner-recorded, all with documented retention, none shared with third parties.
- **Visual assets — separate work item** — explicit pointer to follow-up issue #531.
- **Submission checklist** — operator-facing top-down list for the actual Play Console UI session.

The Italian copy uses idioms the target audience actually says — "quote" for monthly dues (mirrors what an academy owner says to parents at the door), "post-it sulla porta dell'ufficio" / "sticky notes on the office door" for the founder-story hook. Not a literal translation of the EN, just a parallel piece of marketing in the local register.

## Notes

- **Length verification** — `python3 -c '...re.findall...'` against the four fenced code blocks reports 77 / 77 / 2337 / 2488 chars. Re-run on every edit; the doc has the rule at the top.
- **Privacy URLs** — already shipped (#420 cookie banner umbrella). Both `/privacy` (EN) and `/privacy/it` are public, unauthenticated routes.
- **Icon path** — points at `client/public/icons/icon-512.png` already in the repo. The Maskable variant existence is noted; final pick deferred to #531 because Play's accept-rule depends on the actual rendered output, which the visuals issue will verify.
- **Why NOT closing #509** — the issue's acceptance criteria cover copy AND visuals AND privacy. Only copy + privacy are settled here. Closing on this PR would lie about the state of the work; the follow-up #531 carries the visuals.
- No code, no tests, no migrations — pure docs PR. PHPStan / PEST / Vitest / ESLint / Prettier untouched.

## Test plan

- [x] EN short description ≤ 80 chars (77 / 80).
- [x] IT short description ≤ 80 chars (77 / 80).
- [x] EN full description ≤ 4000 chars (2337 / 4000).
- [x] IT full description ≤ 4000 chars (2488 / 4000).
- [x] Both locales link the correct `/privacy` URL (EN → `/privacy`, IT → `/privacy/it`).
- [x] Data Safety table covers every category in Play's actual questionnaire (cross-referenced with the live Console form).
- [x] No code touched — gates unaffected.
- [ ] Native-Italian-speaker review of the IT full description before the listing actually ships to Play (out-of-band; not blocking this PR).
- [ ] Operator runs through the Submission checklist when the listing is filled in Play Console (deferred until #508 + #531 land).
