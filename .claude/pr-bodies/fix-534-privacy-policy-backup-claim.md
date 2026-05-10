## What

Closes #534. Drops the inaccurate **"Daily database backups with 30-day retention"** claim from the privacy policy (markdown source + EN + IT SPA components) and replaces it with a transparent in-implementation note that aligns with the DPA template's existing posture and the production-deployment runbook's "currently zero strategy" reality.

## Why

The privacy policy (`docs/legal/privacy-policy.md` § 5 + the EN + IT SPA components served at `/privacy` and `/privacy/it`) listed "Backup giornalieri della base dati con retention 30 giorni" as a security measure adopted today. Two adjacent in-repo sources prove the claim is currently false:

1. `docs/legal/dpa-template.md` § 8 explicitly notes:
   > **Backup — pianificato.** Una strategia di backup automatizzata […] sarà implementata […] prima del primo cliente con dati reali in produzione.
2. `docs/infra/production-deployment.md` § "What this doc deliberately does NOT cover" confirms:
   > Backups — currently zero strategy.

So the public-facing privacy policy was making a stronger security claim than any internal source could back up. Even before any real customer data is in production, this is a transparency defect under GDPR Art. 5 §1 lett. (a) ("liceità, correttezza e trasparenza"): we cannot tell data subjects we have a security measure we don't actually have.

The fix has to land everywhere a user reads the policy — the markdown source (used by the doc team / lawyer review) and both the EN and IT SPA components (the real public surfaces). They stay in lock-step; the i18n discipline at root `client/CLAUDE.md` § i18n already mandates this.

## How

Three surfaces, three matching edits — the bullet "daily backups, 30-day retention" is replaced with a single bullet describing the actual posture: backup automation is an in-implementation prerequisite that lands before any real production customer data is collected. Wording mirrors the DPA template's "pianificato" framing.

- **`docs/legal/privacy-policy.md` § 5** — bullet replaced. The new bullet also forward-points at DPA § 8 + `docs/infra/production-deployment.md` so the next reader (legal counsel, customer doing due diligence) can audit-trail the implementation status.
- **`client/src/app/features/privacy-policy/privacy-policy.component.html`** (EN) — bullet replaced. New wording: "An automated database-backup plan scheduled to land before any real production customer data is collected." No external link in the SPA bullet (the customer doesn't navigate to the internal doc surface), but the wording is explicit enough to stand alone.
- **`client/src/app/features/privacy-policy/it/privacy-policy-it.component.html`** (IT) — same edit, Italian wording. Parallels the EN bullet.

The three changes ship in a single commit so the i18n discipline holds.

## Notes

- **No spec change required.** Grepped `client/src/` for `Backup giornalieri`, `Daily database backups`, `retention 30`, `30 giorni` — no Vitest spec or Cypress spec asserts on the bullet text. The Cypress `privacy.cy.ts` covers layout / routing, not specific bullet copy.
- **No backend change.** Pure client + docs fix.
- **No `i18n-keys.spec.ts` impact.** The privacy policy is rendered as inline HTML inside locale-specific components, not via translation keys — so the EN and IT components carry their own copy and the parity check doesn't apply here.
- **Why a fix/* and not chore/*** — this is a customer-visible legal claim being corrected from inaccurate to accurate. The privacy policy is part of the public product; mis-claiming a security measure to data subjects is a real defect, not housekeeping. Issue label is `🐛 bug fix` for the same reason.
- **Backwards-compat / SEO** — not relevant. The `/privacy` and `/privacy/it` URLs are unchanged; only one bullet's copy moves.
- **Roll-forward path** — when the actual backup strategy ships (DigitalOcean Managed DB, `mysqldump` cron to object store, or droplet snapshots — pending decision in the prod-deployment doc), the bullet evolves to a factual statement of what's implemented. This PR just stops over-promising in the meantime.

## Test plan

- [x] `grep -rn 'Backup giornalieri\|Daily database backups\|retention 30' client/src/ docs/legal/` returns zero matches after the change.
- [x] `npm run lint` (Angular ESLint) — clean.
- [x] `npm test -- --watch=false` (Vitest) — all 713 tests pass; no spec asserted on the old bullet text.
- [x] Markdown source still readable; both internal references in the new bullet are proper markdown links resolved relatively from `docs/legal/` — `./dpa-template.md` and `../infra/production-deployment.md`.
- [ ] Manual smoke: load `/privacy` and `/privacy/it` in the browser, confirm the bullet has been replaced and the section still renders cleanly.
- [ ] Cypress E2E (CI) — `privacy.cy.ts` verifies routing + page chrome only; not affected by the copy change.
- [ ] Native-Italian-speaker review of the IT bullet phrasing before any legal counsel sees the file (out-of-band, not blocking this PR).
