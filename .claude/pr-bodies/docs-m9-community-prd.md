## What

PRD for **M9 — Community (grading feed + events)**. Lives at `docs/specs/m9-community.md`. No code, only the spec.

The PRD defines the V1 surface for a bounded community layer inside the athlete portal: auto-generated grading celebration posts + owner-created event posts, with emoji reactions and 1-level comments. Identity flair (handle + first/last name + belt) modelled after r/bjj subreddit flairs.

## Why now

Right now, M7 (athlete-side login) is PRD-ready and queued. Writing M9 before M7 ships means:

- When M7 lands, the next implementation slice already has a written direction.
- M7 design decisions that touch M9 (e.g. portal landing page, athlete role enum, M5 notification opt-outs that M9 reuses) get reviewed against M9's needs before they harden.
- 3 V1 design choices need to be made now to be forward-compatible with V2 (cross-academy + map), so the V2-blocking schema decisions can land in V1 migrations without rework later. The PRD captures these explicitly.

## Key product decisions captured

| Decision | Choice |
|---|---|
| Scope | Grading celebrations (auto) + event posts (owner-created); no other post types in V1 |
| Content | Text + emoji reactions (clap 👏 / pray 🙌); no photos |
| Comments | 1 level deep, ≤ 500 chars, owner can soft-delete |
| Identity | System-rendered flair: handle + first/last name + belt |
| Minors | Blocked at athlete-portal registration (birthdate gate) |
| Cross-academy | V2 — but V1 schema (`visibility` enum, lat/lon nullable columns) is already shaped for it |
| Push notifications | 3 new categories added to existing M5 opt-out matrix |

## Open questions left in the PRD

The PRD ends with 4 open questions for the V1 design discussion (owner-announcement post type V1 vs V2, configurable reactions per academy, comment edit window) + 1 explicit "**clarify Tablo reference**" question for the V2 cross-academy map vision — the original conversation mentioned "stile Tablo" and the PRD owner needs to clarify which app/product that refers to before V2 design starts.

## Out of scope of THIS PR

- No code changes. M9 implementation can only start after M7 lands.
- No M7 changes (the PRD only references M7's already-planned surface).
- No migration drafts (they'll land in PR-A of the M9 train, post-M7).

## Test plan

- [x] PRD reads end-to-end in the same style as `m3-documents.md` / `m4-attendance.md` / `m5-notifications.md` / `m7-athlete-login.md`.
- [x] Schema design encodes V2-forward-compat (visibility enum, payload jsonb, lat/lon nullable columns).
- [x] Open questions section explicitly flags the "Tablo" reference as a decision needed before V2.
- [ ] CI green (docs change only — only the format-lint job has any reason to run).

## Provenance

Direct outcome of a feature-brainstorm session: user proposed a social layer for athletes (Facebook-style with photos), Claude pushed back on the full-scope version (moderation burden, GDPR/minors, network-effect threshold, scope explosion), the user iteratively narrowed to grading-celebrations + events, adults-only, no photos, with comments showing r/bjj-style identity flair. The PRD captures that conversation as the binding spec.
