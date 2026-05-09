## What

Refs #227. Adds `docs/legal/dpia-medical-certificates.md` — a **DPIA-lite** for the medical-certificate processing inside Budojo. New file, ~250 lines.

This PR ships the analysis. The **strategic decision** that #227 also asks for (Option A — keep PDFs in Budojo with encryption + audit + DPO, vs Option B — metadata only, file lives in academy's own storage) is explicitly TBD in § 8 of the doc; the user confirms it by editing that section. #227 stays open until the decision is recorded and the consequent code changes ship.

## Why

The DPA template (`docs/legal/dpa-template.md`, shipped with #220) references `dpia-medical-certificates.md` as "pianificata" and the privacy policy similarly leans on it. Without the file, two existing legal artefacts have a dangling pointer.

More importantly, the **strategic A vs B decision** is gating downstream work:

- #224 (`feat(security): encrypt medical certificates at-rest`) is meaningful only under Option A. If the decision lands on B, #224 closes as Won't fix.
- #429 (`feat(audit): immutable audit log of academy actions`) is required under Option A and useful (but not mandatory) under Option B.
- The privacy policy's current "Categoria art. 9" claim depends on which option ships — under B, medical certificate handling falls back to ordinary art. 6 data.

So the doc does two things:

1. **Provides the analysis** — risk identification, mitigations, residual-risk evaluation — that any future external compliance review (or DPO appointment) would need. Anyone who picks the topic up later has the full mental model in one file.
2. **Forces the decision into the open** — both options laid out side-by-side with their dev cost, ongoing compliance cost, UX impact, and future-feature implications, so the user can pick A or B with eyes open instead of letting the choice happen by inertia.

## How

The file is structured in 9 sections:

- **§ 1 What this document is** — DPIA-lite vs full Art. 35 DPIA, scope, decision posture.
- **§ 2 Processing description** — what (medical-cert PDF + metadata), why (D.M. Salute 24-04-2013 obligation), who (controller / processor / authorised personnel), lawful basis (Art. 9 §2 lett. (b) + (h)).
- **§ 3 Necessity & proportionality** — small table, includes the "less invasive alternative" pointer to Option B.
- **§ 4 Retention** — proposed: 24-month window post-expiry, full purge on athlete removal or contract termination.
- **§ 5 Risk identification** — R1-R7 on a probability × severity grid (data breach, internal unauthorised access, cross-academy leak, data loss, extra-EU transfer, retention overrun, SAR un-actionable).
- **§ 6 Mitigations table** — each risk mapped to current and planned controls, cross-referenced to existing issues (#224, #429, sub-processors.md, DPA § 8).
- **§ 7 Strategic decision A vs B** — fully fleshed out. § 7.1 Option A pros/cons + cost. § 7.2 Option B pros/cons + cost. § 7.3 side-by-side comparison table. § 7.4 technical recommendation (B until traction).
- **§ 8 Decision and action items** — TBD with two action lists (one per option). User edits this section to confirm the choice, then the action list for that option becomes the active follow-up plan.
- **§ 9 References** — cross-links to GDPR articles, DPA template, privacy policy, sub-processors, M3 Documents PRD, related issues.

Plus a "TODO sull'issue #227" closing block listing the outstanding non-DPIA acceptance criteria (README update, M3 spec update, legal review) so the issue's full scope is traceable from the file.

## Notes

- **Italian-first** like the rest of `docs/legal/`. Same target audience as the DPA template — Italian academy owners + Italian-speaking legal counsel.
- **Bilingual deferred** — the DPA template's TODO already defers the EN version to "first non-IT customer". This file follows the same posture so the two artefacts stay aligned in scope.
- **Recommendation NOT decision** — § 7.4 lays out the technical reasoning for Option B as the cheaper, safer first move at current scale, but the user makes the call. The recommendation language is explicit ("Opzione B fino a traction sufficiente, poi rivalutare") so the reasoning isn't lost when the decision is finally taken.
- **No code, no tests, no migrations** — pure docs PR. Gates unaffected.
- **Why NOT closing #227** — the issue's full ACs include the strategic decision, README/spec updates, and the legal review. This PR ships only the analysis. A "Closes #227" here would lie about the state of the decision and the dependent code work.

## Test plan

- [x] `docs/legal/dpia-medical-certificates.md` exists and renders as a 9-section DPIA-lite.
- [x] Cross-references to #224, #429, DPA §, privacy-policy.md, sub-processors.md all resolve to existing files / issues.
- [x] The A vs B comparison is symmetrical (both options get a pros, cons, cost, summary cell in the comparison table).
- [x] Recommendation in § 7.4 is unambiguous and motivated.
- [x] § 8 is explicitly marked TBD so a reader can't confuse the recommendation for the decision.
- [x] No code touched — gates unaffected.
- [ ] User confirms Option A or Option B in a follow-up edit (out-of-band; not blocking this PR's merge).
- [ ] Native-Italian-speaker review of the doc before any external counsel sees it (out-of-band; not blocking this PR's merge).
