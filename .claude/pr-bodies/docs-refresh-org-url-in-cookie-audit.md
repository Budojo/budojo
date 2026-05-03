## What

Replaces a single stale `github.com/m-bonanno/budojo` URL in `docs/legal/cookie-audit.md` with the current `github.com/Budojo/budojo` form, to reflect the org transfer.

## Why

After the repo migrated from `m-bonanno/budojo` (user account) to `Budojo/budojo` (org), GitHub's automatic redirect keeps the old URLs working — but a *legal document* should not carry stale URLs:

- Compliance tooling and external auditors that follow the link may flag the redirect as a smell
- Readers verifying the linked issue (#219, the privacy-policy implementation) shouldn't have to mentally translate the URL

`docs/legal/cookie-audit.md` is the cookie audit cited from the privacy policy text; keeping its references current is small but non-cosmetic.

## How

Single-line edit on line 58 — swap `m-bonanno` for `Budojo` in the URL path. Issue number `#219` is unchanged (issue numbers carry over on org transfer).

## Out of scope

Historical documents intentionally retain their `m-bonanno/budojo` URLs as point-in-time records:

- `docs/superpowers/audits/2026-04-28-post-v1.0.0-findings.md`
- `docs/superpowers/plans/2026-04-25-m4-3-attendance-history.md`
- `docs/adr/0001-svg-sanitizer.md`

These are dated artefacts of past work; rewriting the URLs would alter the historical record. The `Owner: m-bonanno` lines in `docs/specs/m3-documents.md` and `docs/specs/m4-attendance.md` are GitHub usernames (intentional, not URLs), and the `--assignee m-bonanno` reference in `.github/workflows/release.yml` is the maintainer's GitHub handle (still correct after the transfer).

## References

Discovered while doing the post-Cloudflare-migration tech-debt sweep started in #351 (the `hotfix:` semantic-release mapping). No issue opened — single-line typo-class fix doesn't justify the ceremony.

## Test plan

- [ ] CI green on the PR
- [x] The new URL `https://github.com/Budojo/budojo/issues/219` resolves to the correct issue (verified manually)
