# M7 — Athlete-side login & self-service (PRD)

> Status: **Draft** · Owner: m-bonanno · Target: 8 PRs (PR-A through PR-H) · Umbrella issue: [#445](https://github.com/Budojo/budojo/issues/445)
> Supersedes the "athlete portal" line on the M6+ roadmap.

## Problem Statement

Through v1.17.0 the Budojo SPA is a single-persona product: every user is the **owner / manager of an academy**. The athletes themselves are passive rows in the `athletes` table — the owner curates their data (name, belt, contact info, medical-certificate expiry, monthly fee status), the athlete never logs in. Several pains accumulate from this shape:

- **The instructor is the bottleneck for every signal.** When a medical cert is about to expire, only the owner gets the M5 reminder email. The athlete — the actual person who has to renew the cert — never hears about it until the owner forwards the message manually.
- **The owner re-enters data the athlete already knows.** Phone number, address, emergency contact — every onboarding session has the owner sitting next to the athlete typing what the athlete is reading off their own ID. A self-service profile page closes that loop.
- **Attendance + payment history is invisible to the athlete.** "How many times did I train last month?" / "Did I pay February?" — answers exist in the database but only the owner can see them. The athlete has to ask.
- **No path forward for community / class signup.** Every conversation about future product surfaces (athlete prenota la lezione, social feed, "vedi i compagni di academy") collapses on the same gap: there's no `User` row for the athlete to attach those features to.

The blocking question is structural: **does an athlete log into Budojo, yes or no?** This PRD says **yes**, and decomposes the smallest V1 that makes the answer real without breaking anything that already ships for owners.

## Goals

1. **Open the SPA to athletes** — same codebase, same hosting, same cost surface, but a second persona with a separate dashboard and a strict subset of read-only views: own profile, own academy public info, own attendance history, own payment history, own documents.
2. **Preserve the owner experience verbatim.** Every owner-side feature, route, guard, button, query, and email keeps working unchanged. M7 introduces no regression on the persona that already pays our bills.
3. **Establish the role boundary as a security primitive.** A `users.role` enum gates which routes / actions / API endpoints are reachable. The boundary is enforced server-side (`role:owner` middleware on writes) and client-side (`ownerOnly` / `athleteOnly` guards) so a bug or a forged JWT can't trivially leak owner data to an athlete or vice versa.
4. **Hard-block self-registration of athletes.** The only way to become `role=athlete` is via a token-signed invitation from an academy owner. There is no "I'm an athlete, sign me up" path on the public web — even if you know your coach's email or your academy's slug. This is a deliberate choice, not a deferral; loosening it later (V3+) would require a fresh PRD pass.
5. **Ship the privacy scaffold for V2 today.** A `users.is_visible_to_peers` toggle persists in V1 (default off) so that the V2 "vedi compagni" page can land without a migration. Scope of public fields is decided here, not later.
6. **Keep V1 free for athletes.** The owner's plan covers athlete logins. Pay-per-athlete is a V3 conversation that requires usage data; gating M7 features on athlete count is explicitly out of scope.

## Non-Goals

- **Athlete self-registration.** No public sign-up form for athletes. Token-invite is the only path. Confirmed product decision; see "Hard rules" below.
- **Athletes uploading their own documents.** V1 read-only on documents the owner uploaded for the athlete (typically the medical certificate). Self-upload is V2 — schema is forward-compatible (`documents.uploaded_by_user_id` already exists implicitly via the `creator` relation; if not, add it in V2's migration).
- **Athlete-side notifications.** M5 today emails the owner. Extending the recipient list to the athlete (when `users` exists for that athlete) is low-effort follow-up — the M5 mail templates and the digest job already exist — but stays out of V1 to keep the surface auditable.
- **Class signup ("prenota lezione").** Requires modeling a class as a first-class entity (today only `training_days` exists as a weekly bitmask). Out of scope; would land in M8 or later.
- **Social layer.** Likes, comments, votes on training sessions — listed in #445 as future-V3, not V1.
- **Multi-academy athletes.** A real-world athlete who trains at two academies. V1 enforces 1 user → 1 athlete row. The schema can be extended to a polymorphic / pivot model in V3 without rewriting V1.
- **Dual-role users.** A user who is both an owner of one academy AND an athlete at another. V1 each user is exactly one role. V3 may add a `coach` role or support multi-affiliation.
- **In-app athlete-to-athlete messaging.** Out of scope.
- **Athlete-facing pricing / payment via app.** Today payments are a gestional artefact the owner records; the athlete pays out-of-band. V1 keeps that model — the athlete sees the history, doesn't trigger the transaction.

## Hard rules (non-negotiable in V1)

These four rules drive the schema and the security model. Loosening any of them later is a fresh PRD conversation, not a single-PR change.

1. **Public `/register` ALWAYS produces `role=owner`.** No flag, no query param, no header lets you create an athlete account through that endpoint.
2. **The token in the invite link IS the auth.** The owner generates an invitation with a signed token + expiry. The signed URL the athlete clicks carries enough information to provision the account. The athlete chooses a password during accept.
3. **Athletes never see other athletes in V1.** Even peer roster — name + belt + photo, no contact details — is V2 and gated on the `is_visible_to_peers` opt-in. V1 ships the toggle UI but no surface that consumes it yet.
4. **Athletes have ZERO write access to academy-scoped resources.** No `POST /athletes`, no `PUT /attendance`, no `DELETE /documents`, no `PATCH /academy`. Server-side `role:owner` middleware + `FormRequest::authorize()` returns false for any athlete attempt with a 403 JSON envelope. PEST regression test per endpoint.

## User Stories

Ordered by user impact.

### Owner — invitation lifecycle

1. **Send an invite to a roster athlete.** As an academy owner, on an athlete detail page where the athlete has an email on file, I want to click "Invita al sistema" and have a signed-link email go out to that athlete — so they can self-serve their profile and history without me being the proxy.
2. **See pending invites.** As an owner, on the athlete detail page I want to see the status of any outstanding invitation (sent at, expires at, resend button) — so I know whether I need to nudge the athlete via WhatsApp.
3. **Resend an invite.** As an owner, I want to resend an invitation that was missed or expired (rate-limited so I can't spam).
4. **Revoke an invite.** As an owner, I want to revoke a pending invitation (e.g. wrong email, athlete left) — so the link no longer works even if the email leaked.
5. **See which roster athletes are linked to a `User`.** As an owner, on the athletes list I want a small badge / column on each row showing whether that athlete has accepted the invite and is now self-serving — so I know who's "in the system".

### Athlete — first contact + onboarding

6. **Click invite, set password, land in dashboard.** As an athlete who got the invite email, I want to click the link, see the form pre-filled with my name + email (read-only), choose a password, accept ToS + privacy, and land directly in my athlete dashboard — without ever filling a registration form from scratch.
7. **Helpful errors on broken invites.** As an athlete, if the link is expired / revoked / the email is already a Budojo user, I want a clear error page explaining what happened and what to do next (contact your coach / sign in instead) — not a 422 toast.

### Athlete — daily use

8. **See my own profile and edit what I own.** As an athlete, I want a profile page where I can change my password, my display name, my avatar, and my own contact details — separate from the gestional fields the owner curates.
9. **See my academy's public face.** As an athlete, I want a `/dashboard/my-academy` page that shows the same public info a prospect would see (name, address, contacts, training days, logo) — so I can answer "who's my coach" / "what's the training schedule" without bothering anyone.
10. **See my attendance history (read-only).** As an athlete, I want a list of every day my owner marked me present, grouped by month, with totals — so I have a self-service "how often did I show up" answer.
11. **See my payment history (read-only).** As an athlete, I want the same monthly payment status the owner sees on my behalf — green / red per month, current balance — so I never have to ask "did I pay April?".
12. **See my documents (read-only).** As an athlete, I want to view + download every document the owner has attached to my profile (medical cert, waivers, registration forms) — so I have my own copy instead of having to email-request.

### Athlete — peer visibility opt-in (V2 prep, ships in V1 as toggle only)

13. **Decide whether I'm visible to my academy peers.** As an athlete, I want a toggle on my profile that says "let other athletes of this academy see my name and belt" — default off — so I'm in control even before any peer-facing surface ships.

## Scope by PR

Eight PRs, sequenced by dependency. Each ships independently and is squash-mergeable.

### PR-A — Schema foundation (no UX change)

**Backend (`server/`)**

- Migration `add_role_to_users` — `users.role` enum string column, default `'owner'`. Backfill every existing row to `'owner'` in the same migration (raw SQL inside `up()`).
- Migration `add_user_id_to_athletes` — `athletes.user_id` nullable bigint FK to `users.id`, `set null` on delete, indexed.
- Migration `create_athlete_invitations_table` — columns: `id`, `athlete_id` (FK, cascade delete), `academy_id` (FK, cascade delete), `email` (string 255, indexed), `token` (string 64, unique, indexed), `expires_at` (timestamp, default now + 7 days), `accepted_at` (nullable timestamp), `revoked_at` (nullable timestamp), `sent_by_user_id` (FK users.id, indexed), `last_sent_at` (timestamp, defaults `created_at`), timestamps.
- New `App\Enums\UserRole` backed string enum (`Owner = 'owner'`, `Athlete = 'athlete'`).
- `User` model: `role` cast to enum, `isOwner()` / `isAthlete()` helpers, `athlete()` hasOne (inverse of `athletes.user_id`; an owner has zero, an athlete has one).
- `Athlete` model: `user()` belongsTo, `invitations()` hasMany.
- `AthleteInvitation` model: `athlete()`, `academy()`, `sentBy()` belongsTo. Scopes: `pending()`, `expired()`. Helper: `isAccepted()`, `isRevoked()`, `isExpired()`.
- PHPStan level 9 clean. PEST coverage on the model methods + scopes.
- **Docs**: `docs/entities/user.md` updated with `role` field. New `docs/entities/athlete-invitation.md`.

**Frontend (`client/`)**

- No UX. Type definitions in `core/services/auth.service.ts`: extend `User` interface with `role: 'owner' | 'athlete'` (default `'owner'` when missing for backward compat with cached envelopes).

**Why no UX**: this PR is the foundation; nothing yet calls these tables. Every subsequent PR depends on it.

### PR-B — Owner-side invitation UI + send action

**Backend**

- `App\Actions\Athlete\SendAthleteInvitationAction::execute(User $sender, Athlete $athlete): AthleteInvitation`. Validates: athlete has an email, sender owns the academy, the invitee email isn't already a `User` (would 422 with `email_already_registered`), no other pending un-revoked invitation exists for that athlete (re-use it instead → bumps `last_sent_at`). Generates 64-char URL-safe token, persists row, queues `AthleteInvitationMail`.
- `App\Mail\AthleteInvitationMail` — Markdown template. Subject `"Sei stato invitato in Budojo da {academy.name}"` (i18n via the academy's stored locale or English default). Body: greeting with athlete name, name of the academy + owner, signed CTA link, expiry note ("link valido per 7 giorni"), what they can do once they accept.
- Routes (under `auth:sanctum` + `verified.api`):
  - `POST /api/v1/athletes/{athlete}/invite` — calls Action, returns 201 with `AthleteInvitationResource`. Throttled `5,1` per user.
  - `POST /api/v1/athletes/{athlete}/invite/resend` — calls Action with re-use semantics, returns 200. Throttled `1,1` per athlete (so the owner can't spam a single inbox).
  - `DELETE /api/v1/athletes/{athlete}/invitations/{invitation}` — sets `revoked_at`, returns 204.
- `FormRequest::authorize()` checks `$user->isOwner() && $user->academy?->id === $athlete->academy_id`. Note: ownership lives on `academies.user_id` (so `User::academy()` is `HasOne`); there is NO `users.academy_id` column. The check is "the owner's owned academy is the same as the athlete's academy".
- PEST tests: happy path queues mail + persists row; rejects athlete without email; rejects email already a User; rejects non-owner caller; resend re-uses pending row; revoke nullifies token; throttle behaviour.

**Frontend**

- On the athlete detail page, a new "Account & invito" section (visible only to owners). States:
  - No invitation + athlete has email → button "Invita al sistema".
  - Pending invitation → status chip "Invito inviato il DD/MM, scade DD/MM" + "Invia di nuovo" button + "Revoca" link-button.
  - Accepted invitation → status chip "Atleta registrato il DD/MM" + small "👤" icon link to a hidden user-detail tooltip.
- `core/services/athlete.service.ts` gains `invite(athleteId)`, `resendInvite(athleteId)`, `revokeInvite(athleteId, invitationId)`.
- Vitest: service spec + component spec asserting all three states render.
- Cypress: owner-side E2E — open athlete detail → click invite → toast → state shows "Invito inviato".
- i18n: EN + IT keys for every visible string.

### PR-C — Athlete signup flow (consume invitation)

**Backend**

- Public route (no auth required): `GET /athlete-invite/{token}` (web route, signed). Renders an SPA-bound HTML shell that the SPA consumes by reading the token from the URL. Alternatively pure-API: `POST /api/v1/athlete-invite/{token}/preview` returns the invitation (athlete name + email + academy name) for the SPA to pre-fill the form.
- `POST /api/v1/athlete-invite/{token}/accept` — accepts `password`, `password_confirmation`, `accept_privacy`, `accept_terms`. Calls `App\Actions\Auth\AcceptAthleteInvitationAction::execute(string $token, string $password, ...)`. The action: validates token (signed + not expired + not accepted + not revoked), creates `users` row with `role = athlete` + verified email (skip the M5 verify-email step since the invite token IS the email proof), links `athletes.user_id`, sets `accepted_at`, dispatches a Sanctum token. Returns the auth token + the user envelope.
- Re-uses the same UX pattern as `/auth/register`: privacy + ToS checkboxes are mandatory at submit. The persisted audit column is `users.terms_accepted_at` (added by #437); privacy acceptance is gated at the form level (the user can't submit without ticking it) but does NOT have a separate column today. If a future legal review demands it, a follow-up adds `users.privacy_accepted_at` — out of scope for V1, mirroring the current owner-register behaviour.
- PEST: happy path persists `terms_accepted_at`; rejects expired / accepted / revoked; rejects when email already exists as a different User; rejects without privacy + ToS booleans; idempotent under double-click (second request returns 410 not 500).

**Frontend**

- New public route `/athlete-invite/:token` outside the dashboard shell. Component fetches the preview, renders form: Name (read-only), email (read-only), password + confirm, privacy + ToS checkboxes (mirrors the register form), submit → on success store the token + auto-redirect to the athlete dashboard root.
- Error states: expired link / revoked / already-accepted / email-already-registered → friendly page with "what to do next" wording (call your coach, sign in if you already have an account, etc.).
- Cypress: full flow — visit `/athlete-invite/{validToken}` → fill password → submit → assert auth token in localStorage + redirect to `/dashboard/me/profile` (the athlete dashboard root, see PR-D).
- i18n: EN + IT.

### PR-D — Athlete dashboard shell + role routing

**Frontend (the heavy PR)**

- New top-level dashboard router branching on role. The existing `dashboardRoutes` stay for `role=owner`. A new sibling tree under `/dashboard/me/...` serves athletes, with its own `DashboardComponent` (sidebar shows: Profilo, La mia academy, Le mie presenze, I miei pagamenti, I miei documenti, Aiuto, Novità, Esci).
- `core/guards/role.guard.ts`: functional guards `ownerOnlyGuard` and `athleteOnlyGuard`. The first wraps every existing dashboard route — if `user.role !== 'owner'` redirect to `/dashboard/me/profile`. The second guards the new `/dashboard/me/*` tree — if `user.role !== 'athlete'` redirect to `/dashboard/athletes`.
- Login post-success redirect picks the right shell by role (already-existing logic that detects "no academy → setup" stays for owners; athletes never hit setup).
- Topbar avatar + sign-out work identically across both shells.
- Vitest: guard specs (each role + edge case where role is missing).
- Cypress: athlete logs in → asserts they cannot reach `/dashboard/athletes` (redirect) and can reach `/dashboard/me/profile`.
- i18n keys for the new sidebar entries + page titles.

**Backend**

- `UserResource` exposes `role` so the SPA can branch correctly.
- No new endpoints — the athlete-side endpoints land in PR-E.

### PR-E — Athlete-only API surfaces

**Backend**

- `GET /api/v1/me/athlete` — returns the athlete record linked to the authenticated user via the `User::athlete()` hasOne relation (which reads `athletes.user_id`). 404 if `users.role !== 'athlete'` or no athlete is linked.
- `GET /api/v1/me/academy` — returns the athlete's academy as `AcademyPublicResource` (a NEW resource that strips owner-only fields like the monthly fee — see also the V2 marketing-public surface that may want this).
- `GET /api/v1/me/attendance?from=YYYY-MM&to=YYYY-MM` — read-only attendance history, paginated by month, only the athlete's own rows.
- `GET /api/v1/me/payments?year=YYYY` — read-only payment status for the year, only the athlete's own rows.
- `GET /api/v1/me/documents` — list (read-only) of the athlete's own documents. Re-uses the existing `DocumentResource` but only filters by `documents.athlete_id = athlete_id`.
- `GET /api/v1/me/documents/{document}/download` — reuses the existing download endpoint with a stricter authorization (the document must belong to the authenticated athlete).
- All routes guarded by `role:athlete` middleware (next PR adds the middleware) — until then the `FormRequest::authorize()` per-route does the same check inline.
- PEST coverage per endpoint: happy path, 403 if owner calls them, 404 if athlete has no linked athlete row, scoping enforcement (athlete A cannot read athlete B's history).

**Frontend**

- New components under `features/me/`:
  - `MeProfileComponent` (`/dashboard/me/profile`) — own contact info edit, password change (re-uses the M5 `/me/password` action), avatar upload (re-uses #440).
  - `MyAcademyComponent` (`/dashboard/me/academy`) — read-only academy public page.
  - `MyAttendanceComponent` (`/dashboard/me/attendance`) — month switcher + day list.
  - `MyPaymentsComponent` (`/dashboard/me/payments`) — year switcher + 12-row table.
  - `MyDocumentsComponent` (`/dashboard/me/documents`) — list + download.
- Service `core/services/me.service.ts` — wraps every endpoint above.
- Vitest per component. Cypress E2E covers the navigation through every page.
- i18n EN + IT.

### PR-F — Owner-side privacy gates (server-side hardening)

**Backend**

- New middleware `App\Http\Middleware\EnsureUserHasRole` registered as `role:{owner|athlete}` in `bootstrap/app.php`.
- Apply `role:owner` to every owner-only mutation route: `/athletes/*` writes, `/attendance/*` writes, `/documents/*` writes, `/academy` writes, `/stats/*`. Stay role-agnostic (reachable by both): `/me/avatar`, `/me/password`, `/me/export`, `/me/deletion-request`, `/support` (athletes file tickets too). Apply `role:athlete` to the new `/api/v1/me/{athlete,academy,attendance,payments,documents}` reads added in PR-E. Read endpoints whose URL itself is non-discriminating (e.g. `GET /athletes` index for the owner roster) keep the existing auth gate — the athlete shell never calls them, so no middleware is strictly required, but the reviewer must confirm in PR-F that adding `role:owner` doesn't break any contract today.
- Audit each route in `routes/api_v1.php` line by line; mark in PR description which route gets which middleware and why.
- PEST regression: ONE test per gated route asserting an athlete user gets 403 with `{ message: 'role_required' }` envelope. The SPA's auth interceptor keys on that string for redirect.
- Decision recorded in PR description: owner-side reads (e.g. `GET /athletes`) — do they 403 for athletes too? V1 yes (the athlete shell never calls them, an athlete reaching them is suspicious). V2 may relax for the peer-roster surface, with its own dedicated resource.

**Frontend**

- `core/interceptors/error.interceptor.ts` — handle `role_required` 403 by signing the user out and redirecting to login with a toast. Defence-in-depth (the role guard in PR-D should already prevent the call).
- Cypress: owner-side and athlete-side regression suite — assert each persona reaches the expected dashboard root and the cross-persona URL paths bounce.

### PR-G — Profile visibility opt-in (V2 scaffold)

**Backend**

- Migration `add_is_visible_to_peers_to_users` — boolean column, default `false`, nullable false.
- `User` model: cast to bool, default `false`, expose on `UserResource`.
- New endpoint `PATCH /api/v1/me/visibility` with body `{ is_visible_to_peers: bool }`. Athlete-only (role middleware). Updates the column.
- PEST: happy path; owner gets 403; payload validation (must be a bool).

**Frontend**

- On `MeProfileComponent` (or a sub-section), a Material-style switch labelled "Mostra il mio profilo ai compagni di academy" with a description "Quando attivato, gli altri atleti della tua academy potranno vedere il tuo nome, la cintura e la foto. Ancora non c'è una pagina che usa questa preferenza — sarà disponibile in una prossima versione."
- Calls `me.service.updateVisibility(boolean)`. Optimistic UI with rollback on 4xx.
- Vitest + Cypress.
- i18n EN + IT.

**Why ship it now**: the column is migrated in production before V2 needs it, so V2 can ship its peer-roster page without a coupled migration. Apple-style "decide once, ship the option" — even though there's no surface yet that consumes it, the user already has agency.

### PR-H — Documentation, i18n, whats-new

**Documentation**

- This PRD is checked in by PR-A's commit history (or by an earlier prep PR, see "Sequencing" below).
- `docs/entities/user.md` — gains `role` + `is_visible_to_peers` columns + the role enum table.
- `docs/entities/athlete.md` — `user_id` field + the relation note.
- `docs/entities/athlete-invitation.md` — new file mirroring the support-ticket entity pattern (purpose, schema, relations, lifecycle states, business rules, related endpoints, out-of-scope future).
- `docs/api/v1.yaml` — every new endpoint added (paths + schemas + tags). New tag `me` for the athlete-side group.
- `docs/design/DESIGN_SYSTEM.md` — note the role-aware sidebar (`/dashboard/me/*` shell vs `/dashboard/*` shell).
- `docs/legal/privacy-policy.md` (and IT version) — new section "Trattamento dei dati per gli utenti atleti": data we collect from them at invite-accept (password hash, accepted ToS / privacy timestamps), data we display to them (own gestional record, including data the owner curates on their behalf), retention, deletion path.
- `docs/legal/sub-processors.md` — no change (no new vendor); still re-read to confirm.
- `CLAUDE.md` (root + `server/` + `client/`) — note the role discriminator and the rule "the role middleware is the security primitive, every new endpoint must declare its role intent in the route file".

**i18n**

- EN + IT key parity check (the existing `i18n-keys.spec.ts` regression catches drift).
- Banned patterns reminder: no hardcoded aria, no template-literal toast detail.

**Whats-new**

- Markdown source `docs/changelog/user-facing/v1.18.0.md` (or whichever stable version M7 ships under).
- Typed `Release` entry prepended in `whats-new.component.ts` + the `whats-new.component.spec.ts` count + version-pin updated.
- Lockstep — same commit history as the release PR.

## Sequencing

```
PR-A (schema)
  └── PR-B (owner invite UI)
        └── PR-C (athlete signup flow)
              └── PR-D (dashboard shell + role routing)
                    ├── PR-E (athlete-only APIs + pages)
                    └── PR-F (server-side role gates)   ← parallelizable with PR-E
                          └── PR-G (visibility opt-in scaffold)
                                └── PR-H (docs + i18n + whats-new)
```

PR-A through PR-D are strictly sequential. PR-E and PR-F can land in parallel. PR-G is small and depends on PR-D (route exists). PR-H is the lockstep doc/whats-new sweep that closes the milestone.

## Tech Decisions

- **Single `users` table.** No separate `AthleteAccount` model. Discriminator is `users.role`. Every existing `users` query stays valid; reads that should be owner-only get a `->where('role', 'owner')` clause as audited in PR-F.
- **Token-based invite is signed, not random.** Use Laravel's `URL::temporarySignedRoute()` so we don't need a separate signing key — the framework's `APP_KEY` is the trust anchor. Token column on `athlete_invitations` is the signature payload + expiry, indexed for lookup.
- **Athlete `email_verified_at` is set on accept.** The invite click PROVES email ownership (the email was deliverable; the link is single-use). Skip the M5 verify-email second step for invited athletes. New owners through `/register` keep the existing M5 verify-email gate.
- **Athletes get a Sanctum token like owners.** Same auth surface, same SPA bootstrap. The role check is the only branch.
- **Two dashboard shells, not one with conditionals.** A separate `DashboardComponent` for athletes (`features/me/me-shell.component.ts`) instead of an `*ngIf` ladder inside the existing one. Cleaner, easier to test, easier to evolve (V2's peer-roster page only adds an entry to the athlete shell).
- **Public academy resource is a NEW resource, not a filtered version of `AcademyResource`.** `AcademyPublicResource` strips fields like `monthly_fee` that are owner-private. The athlete sees the same shape a marketing visitor would (when the public academy page eventually ships).
- **`role:owner` middleware is the load-bearing primitive.** Not a `Gate::define` policy — middleware is grep-able from `routes/api_v1.php`, harder to forget on a new route. Every new gestional route that lands after M7 must declare its `role:` in the same file so a reviewer can audit.

## Out of Scope (deferred to future milestones)

- **Athlete uploads documents to their own profile.** V2 — additive; needs `role:athlete` write endpoint + a UI on `MyDocumentsComponent`. The schema doesn't change.
- **M5 expiry-digest email cc's the athlete.** V2 — extends the existing job to optionally `bcc` the athlete's `User` email when present. Pure mail-template + recipient-list change, no new schema.
- **Peer roster page (`/dashboard/me/peers`).** V2 — consumes the V1 `is_visible_to_peers` toggle. The query joins through `User::athlete()->academy_id` (NOT a `users.academy_id` column, which doesn't exist) and filters peers in the same academy with `is_visible_to_peers = true`. Public fields only (name, photo, belt + grade, optional social handle).
- **Class signup ("prenotami per la lezione").** V3 — needs class-as-instance modeling.
- **Social layer.** V3+ — likes/comments/votes on training sessions.
- **Pay-per-athlete pricing.** V3 conversation, gated on actual usage data.
- **Multi-academy athlete (one user, multiple `athlete` rows in different academies).** V3 — schema migration to a polymorphic / pivot model.
- **Coach role / dual-role users.** V3+ — separate role enum case + UI to switch contexts.

## Success Criteria

The milestone ships when:

1. An owner can invite a roster athlete from their detail page, the athlete receives the email, clicks, sets a password, and lands in their dashboard within 30 seconds end-to-end.
2. The athlete can navigate every page in `/dashboard/me/*` and read their data without ever 4xx-ing or 5xx-ing.
3. The athlete cannot reach a single owner-side route — neither client-side (guard redirect) nor server-side (403 with `role_required`).
4. Every existing owner-side flow on develop the day before PR-A merges still works the day after PR-H merges. Zero regression on the owner persona.
5. The privacy / ToS / sub-processors docs are updated in lockstep.
6. The whats-new entry tells the story to a non-technical reader without mentioning roles, middleware, or signed tokens.
7. PEST + Vitest + Cypress green at every PR. CI is the only gate that opens merge.

## References

- Umbrella issue: [#445](https://github.com/Budojo/budojo/issues/445) — vision + open product questions (this PRD answers them).
- Related PRDs: `docs/specs/m3-documents.md`, `docs/specs/m4-attendance.md`, `docs/specs/m5-notifications.md`.
- M5 PR-D `MedicalCertExpiryDigestMail` — the queued-mail pattern this milestone reuses for `AthleteInvitationMail`.
- PR #437 (Terms of Service + acceptance gate) — the audit pattern this milestone reuses for athlete signup.
- PR #440 (avatar upload) — the multipart upload pattern shared between owner + athlete profiles.
- PR #441 (`/dashboard/support`) + PR #446 (consolidation) — the "athletes also get a contact channel" surface; both roles file support tickets via the same form, role-agnostic.
