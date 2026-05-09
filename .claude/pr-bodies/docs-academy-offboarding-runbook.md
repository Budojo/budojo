## What

Adds `docs/operations/academy-offboarding.md` — the manual procedure the Budojo team follows when an academy customer terminates the contract. Closes the dangling forward-pointer that both the DPA template (§ 12) and the DPIA-lite (§ 4) carried as "TODO follow-up". Same PR also converts those two pointers from inline-code TODO tags to proper relative markdown links (`../operations/academy-offboarding.md`).

This PR doesn't close any single open issue — it's a planned follow-up referenced from #220 (DPA template) and #227 (DPIA-lite). Both of those issues stay open for their other ACs (signup workflow, A/B decision, etc.).

## Why

Two existing legal docs in `docs/legal/` made a promise to the reader ("the manual offboarding procedure is documented in `docs/operations/academy-offboarding.md`") and the file didn't exist. Anyone reviewing the DPA template or DPIA-lite — counsel, customer doing due diligence, future you — would follow the link, hit a 404 inside the repo, and lose trust in the rest of the doc.

The procedure itself isn't new: the team had a mental model of "communicate cessation → 30-day grace export → purge". The doc just writes it down with the per-step checklist, the cross-reference to schema artefacts that need to land at the first real offboarding (a `users.disabled_at` column, an `academy_offboardings` audit table, an `artisan academy:purge` command), and the exception cases (legal retention obligation, single-athlete art. 17 — which is `/me/deletion-request` not this runbook, Garante orders, customer-requested freezes).

Posture is **deliberately manual**, not cron-driven automation. Reasoning lives in the doc itself: today the volume is zero, terminations will be rare and never bulk, a written checklist a human walks through is cheap to revise, and the audit trail is the human + the `academy_offboardings` row, not a faceless cron run. When the volume justifies automation, this runbook becomes the spec for it — every artisan command + table mentioned in § "Documentation collateral required" is the implementation roadmap.

## How

Single new file `docs/operations/academy-offboarding.md`, ~150 lines, structured in 6 sections:

1. **When it applies** — three trigger conditions; T0 = effective date, NOT communication date; T0 derivation rule for the unilateral-non-renewal case.
2. **The three temporal windows** — table mapping Pre-T0 / Grace export / Purge to dates and to what happens in each. The customer is informed of all three at T-30 so the timeline is never a surprise.
3. **Step 1 (T-30) — Notification** — email content, channel (transactional + PEC for enterprise), tracking via outbox_log (TODO when the table lands).
4. **Step 2 (T0) — Disable operational** — login disable, mark in `academy_offboardings`, suspend per-academy crons (notably `budojo:send-medical-cert-expiry-reminders` so post-cessation reminders don't fire on orphan academy_ids), internal team notification.
5. **Step 3 (T0 → T+30) — Grace export** — what's possible (export on request via SSH-driven artisan command), what isn't (state restore, data modifications). The "no restore" rule is security-driven, not technical limitation.
6. **Step 4 (T+30) — Purge** — mandatory pre-checklist (export ack confirmed, idempotency check, snapshot before procedure), then a step-by-step purge cascade across `documents` files on disk → DB tables (attendance_records → documents → athletes → users → personal_access_tokens → academies) → queued mail → log policy → sub-processors. Sub-processors land on "no action required" because none of them keep a separate copy outside the droplet.
7. **Exceptions** — table covering the four real cases (legal retention obligation, athlete-art-17 vs academy-offboarding distinction, Garante order suspension, customer-requested freeze).
8. **Documentation collateral required** — explicit list of artefacts the runbook references that don't exist yet (`users.disabled_at`, `academy_offboardings` table, `artisan academy:export`, `artisan academy:purge`, `artisan academy:purge-queued-mail`, an outbox-log table). This is the implementation backlog — the runbook IS the spec.

Plus the two adjacent edits closing the loop:

- `docs/legal/dpa-template.md` § 12 — the bullet referencing `docs/operations/academy-offboarding.md` is now a real markdown link to `../operations/academy-offboarding.md` (correct relative path from `docs/legal/`). "(TODO follow-up)" qualifier dropped.
- `docs/legal/dpia-medical-certificates.md` § 4 — same edit on the retention-table row.

## Notes

- **Italian-first** — same posture as the rest of `docs/legal/` and `docs/operations/`. Operator-facing doc; the operator is the Italian-speaking founder until role expansion lands (#427/#428).
- **No code changes** — pure docs PR. PHPStan / PEST / Vitest / ESLint untouched.
- **Why "operations" and not "legal"** — the procedure is operator-facing (what the team does on a Monday morning when an offboarding email arrives), not legal text. The legal artefact is the DPA § 12; this is the corresponding operational checklist. Different audience, different lifecycle.
- **Refs (not Closes) #220 and #227** — neither issue is fully resolved here. #220 still wants the EN translation, signup workflow, e-signature decision, `/legal/dpa` page. #227 still wants the strategic A/B decision + downstream code work. This PR closes only the "academy-offboarding.md exists" sub-promise.
- **The TODOs in the runbook itself are a feature, not a bug** — they're the explicit list of what the first real offboarding will demand from the codebase. When that day comes, the operator opens this file, sees the TODOs, opens the corresponding issues, ships the code, and updates the runbook from "TODO" to "implemented". The doc is the seed of the implementation, not a wish list.

## Test plan

- [x] `docs/operations/academy-offboarding.md` exists and renders correctly.
- [x] Both forward-pointers in `docs/legal/dpa-template.md` § 12 and `docs/legal/dpia-medical-certificates.md` § 4 are now proper markdown links with relative path `../operations/academy-offboarding.md`.
- [x] Cross-references in the new doc resolve (`docs/legal/dpa-template.md`, `docs/legal/dpia-medical-certificates.md`, `docs/legal/privacy-policy.md`, `docs/infra/production-deployment.md`, GDPR articles).
- [x] No code changed — gates unaffected.
- [ ] Counsel review of the procedure before any external customer reads the DPA template or follows the link out (out-of-band, not blocking).
- [ ] First real offboarding tests the doc end-to-end. Update on real-world friction.
