# Multi-user — PRD

> Status: draft (#427 / #428 umbrella). Reviewed by m-bonanno before any sub-issue is opened. The implementation order at the bottom is the proposed PR sequence; nothing under "Implementation order" gets started until this PRD is approved.

## 1. Problem

An academy is owned by exactly one user today. Real academies have multiple people on staff:

- One **owner** (the legal entity / decision-maker) — the user who registered.
- Zero-to-many **admins** (head instructors, business partners) who can do everything except remove the owner.
- Zero-to-many **instructors** who teach classes and record attendance / promotions but don't touch the academy's finances or settings.
- Zero-to-many **assistants** (front-desk / part-time staff) who can view the roster + check athletes in but can't create or delete athletes.

Without this, Budojo cannot serve any academy larger than a single-instructor school. It's the most-requested gap from the alpha-tester pool.

## 2. Goals

- Each `academies` row can have multiple users tied to it via a **membership**.
- Each membership carries a **role** (one of `owner` / `admin` / `instructor` / `assistant`).
- The role drives a fixed **capability matrix** (next section). Every API endpoint enforces the capability before doing work; the SPA hides CTAs the user can't use.
- A user can be a member of multiple academies. The active academy is per-session state.
- Existing single-owner academies migrate cleanly (every existing `users.id` ↔ `academies.user_id` pair becomes a `(user_id, academy_id, role: owner)` membership row).

## 3. Non-goals (v1)

- Cross-academy reporting (one academy active per session; switch to query the other one).
- Billing-per-seat (no billing system yet).
- Custom roles defined per academy (fixed 4-role set covers the alpha-tester demand).
- Per-resource ACLs (e.g. "only Mario can edit Luigi's athletes"). Membership + role is the only gate.
- Role inheritance / hierarchies. The matrix is a flat lookup.

## 4. Capability matrix

| Capability                                          | owner | admin | instructor | assistant |
|-----------------------------------------------------|-------|-------|------------|-----------|
| Academy settings — read                             | ✓     | ✓     | ✓          | ✓         |
| Academy settings — update (name / logo / fee / …)   | ✓     | ✓     | ✗          | ✗         |
| Team — list members + pending invitations           | ✓     | ✓     | ✓          | ✓         |
| Team — invite member                                | ✓     | ✓     | ✗          | ✗         |
| Team — revoke member / invitation                   | ✓     | ✓     | ✗          | ✗         |
| Team — change member role                           | ✓     | ✗     | ✗          | ✗         |
| Athletes — read                                     | ✓     | ✓     | ✓          | ✓         |
| Athletes — create / update                          | ✓     | ✓     | ✓          | ✗         |
| Athletes — delete                                   | ✓     | ✓     | ✗          | ✗         |
| Athletes — restore (#700)                           | ✓     | ✓     | ✗          | ✗         |
| Documents — read                                    | ✓     | ✓     | ✓          | ✓         |
| Documents — upload                                  | ✓     | ✓     | ✓          | ✗         |
| Documents — delete                                  | ✓     | ✓     | ✗          | ✗         |
| Attendance — read                                   | ✓     | ✓     | ✓          | ✓         |
| Attendance — record / undo                          | ✓     | ✓     | ✓          | ✓         |
| Payments — read                                     | ✓     | ✓     | ✓          | ✓         |
| Payments — mark paid                                | ✓     | ✓     | ✓          | ✓         |
| Payments — mark unpaid                              | ✓     | ✓     | ✗          | ✗         |
| Promotions — record                                 | ✓     | ✓     | ✓          | ✗         |
| Community — post event                              | ✓     | ✓     | ✓          | ✗         |
| Community — read feed + react + comment + RSVP      | ✓     | ✓     | ✓          | ✓         |
| Stats — view                                        | ✓     | ✓     | ✓          | ✓         |

**Owner-only specials**:
- Change another member's role.
- Transfer ownership (out of scope v1, but the matrix is the foundation).
- Delete the academy itself.

## 5. Data model

### `academy_memberships`

```
id                bigint PK
user_id           bigint  FK users        cascadeOnDelete
academy_id        bigint  FK academies    cascadeOnDelete
role              enum('owner','admin','instructor','assistant')
joined_at         timestamp
revoked_at        timestamp NULL          (soft-revoke: keeps the audit trail intact)
created_at, updated_at timestamps

UNIQUE (user_id, academy_id)        — one membership per (user, academy)
INDEX (academy_id, role)             — list-members + capability lookups
INDEX (revoked_at)                   — active-memberships filter
```

**Invariant**: every academy MUST have exactly one active (`revoked_at IS NULL`) `owner` membership. Enforced by a `BeforeRevoke` observer hook on `AcademyMembership` + a PEST regression.

### `academy_invitations`

```
id                bigint PK
academy_id        bigint  FK academies    cascadeOnDelete
email             varchar(255)            (target invitee — may not have an account yet)
role              enum('admin','instructor','assistant')  — NOT owner (no transfer in v1)
token_hash        char(64)                (SHA-256 of the URL token — same shape as password resets)
invited_by_user_id bigint FK users        — who sent the invite (for audit)
expires_at        timestamp               (default +7 days; configurable per env)
accepted_at       timestamp NULL          (set on accept; deletes after grace via a cron)
revoked_at        timestamp NULL          (set when the inviter cancels before acceptance)
created_at, updated_at timestamps

INDEX (academy_id, accepted_at, revoked_at)   — list-pending filter
INDEX (email)                                  — lookup-by-invitee on register
UNIQUE (academy_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL
                                               — one pending invite per (academy, email) at a time
```

### `users.active_academy_id`

```
ALTER TABLE users ADD COLUMN active_academy_id BIGINT NULL
   FK academies ON DELETE SET NULL;
```

Backfill: `UPDATE users u SET active_academy_id = (SELECT id FROM academies a WHERE a.user_id = u.id LIMIT 1)`.

The SPA reads this value on `/auth/me` and the dashboard shell scopes every request to it.

### `academies.user_id` — keep or drop?

**Keep**, BUT renamed conceptually to "primary owner pointer". Today's `App\Models\Academy::user()` relation continues to work for legacy callsites (the few places that need to know "the registering account"). Authz no longer reads it; authz reads `academy_memberships` exclusively.

## 6. Authorization rewrite

### Pattern today

Every academy-scoped controller / FormRequest reads `auth()->user()->academy`:

```php
public function authorize(): bool
{
    return $this->user()?->academy !== null;
}
```

### Pattern after

```php
public function authorize(): bool
{
    return $this->user()?->canInAcademy(
        $this->route('athlete')->academy_id,
        Capability::AthletesUpdate,
    ) ?? false;
}
```

Where:

```php
// App\Models\User
public function memberships(): HasMany { … }
public function activeMembership(): ?AcademyMembership { … }   // resolves users.active_academy_id
public function canInAcademy(int $academyId, Capability $cap): bool;
```

And `App\Authorization\RoleMatrix::can(Role $role, Capability $cap): bool` is the single source of truth for the capability table — backed by an array literal that mirrors § 4 verbatim, and pinned by a PEST regression spec.

### Migration plan per controller

Every FormRequest under `App\Http\Requests\**` gets its `authorize()` rewritten. This is ~30 files but each change is mechanical and follows the same pattern. Sub-issue § 9.2 covers the rewrite in one PR.

## 7. Invite flow

### Step-by-step (owner/admin invites Maria, who already has a Budojo account)

1. Owner clicks "Invita teammate" on `/dashboard/team`.
2. SPA shows modal: email + role select.
3. `POST /api/v1/academy/invitations` `{email, role}` → backend creates `academy_invitations` row with a fresh signed token, queues invitation email via `Mail::queue`.
4. Maria receives email "<Inviter> wants you on Academy X" with link `https://budojo.it/team/invitations/accept?token=…`.
5. Maria clicks → SPA's `AcceptInvitationComponent` shows "Vuoi unirti a Academy X come Instructor?" with Accept / Decline.
6. On accept (logged in): `POST /api/v1/team/invitations/accept {token}` → creates `academy_memberships` row, sets `invitations.accepted_at = NOW()`, sets `users.active_academy_id = academy_id` if it was null, redirects to dashboard.
7. Owner receives in-app notification + optional email "Maria ha accettato".

### Variant: invitee doesn't have a Budojo account yet

1. Same as steps 1-4.
2. Maria clicks the link → SPA's `AcceptInvitationComponent` detects no auth → redirects to `/auth/register?invitation_token=…&email=…`.
3. Register form pre-fills email, hides "Create your academy" copy (since she's joining one).
4. On `POST /auth/register`: backend creates the user, immediately consumes the invitation token, creates the membership. Email-verification flow remains unchanged.

### Variant: invitee is already a member of this academy

`POST /team/invitations/accept` returns 409 with a copy "You're already part of this academy". The invitation row is auto-revoked.

### Email infrastructure

A new `App\Mail\AcademyInvitationMail` mailable. Template `resources/views/emails/academy-invitation.blade.php`. Standard MJML / inline-style pattern from the other transactional emails. Localised EN + IT.

## 8. SPA changes

### Topbar academy switcher

In the dashboard shell topbar, just left of the user avatar chip:

- **0 or 1 active memberships**: no switcher (current single-academy UX preserved).
- **2+ active memberships**: dropdown showing the academy name + role badge per row. Active academy at the top with a check.
- Switching: `PATCH /me/active-academy {academy_id}` → page reloads to re-bootstrap with the new scope.

### `/dashboard/team` page

- Header: "Team — Academy X" + invite button (gated on `Capability::TeamInvite`).
- **Active members** table: avatar, full name, email, role chip, joined date, kebab menu (revoke / change-role, both gated on capability).
- **Pending invitations** list (collapsed by default): email, role, sent date, kebab menu (resend / revoke).
- Empty state copy when only the owner is present: "You're flying solo. Invite a co-instructor or an assistant."

### `/team/invitations/accept` page (public, no auth gate)

- Reads `?token=` from the URL.
- If unauthenticated: redirect to `/auth/register?invitation_token=…&email=…` (server returns the email + academy name from the token preview endpoint `GET /team/invitations/{token}/preview`).
- If authenticated: shows the confirmation card with academy name + role + Accept / Decline.

### Conditional CTA rendering

Every page that today shows "Add athlete" / "Mark unpaid" / "Settings" needs a capability gate. Implemented as a directive `*budojoCan="'athletes.delete'"` that resolves through `AuthService.activeMembership` + the same `RoleMatrix` JSON the backend ships under `/auth/me`.

## 9. Implementation order (sub-issues)

Each sub-issue is one PR. Order matters — earlier ones unblock later ones.

1. **Schema + models** (closes part of #427). `academy_memberships` + `academy_invitations` migrations, models + factories, `users.active_academy_id` column, backfill migration. Plus the invariant test (one active owner per academy). No HTTP changes yet; the existing authz path keeps working untouched because `academies.user_id` is preserved.
2. **`RoleMatrix` + `Capability` enum** (closes part of #428). Pure-PHP enum + array literal under `App\Authorization`. PEST regression: every (role, capability) cell of § 4 pinned.
3. **`User::canInAcademy()` helper + active-academy resolver**. `activeMembership()`, `canInAcademy()`, `GET/PATCH /me/active-academy`. PEST coverage.
4. **Backend authz rewrite** — every FormRequest's `authorize()` migrated to capability check. One PR; ~30 files; PEST parity (every existing test continues to pass at parity, plus new "wrong role gets 403" cases per controller).
5. **Invite flow backend**: routes + Action classes (`CreateAcademyInvitationAction`, `AcceptAcademyInvitationAction`, `RevokeAcademyInvitationAction`), `AcademyInvitationMail`, opt-in to existing `NotificationCategory::ACADEMY_INVITATION` (extends a row in the prefs panel).
6. **Invite flow frontend**: `/dashboard/team` page + invite modal + pending-invitations list + capability-gated CTAs.
7. **Accept-invitation frontend**: `/team/invitations/accept` route + the register-with-invitation-token variant.
8. **Topbar academy switcher**: dashboard-shell dropdown rendered when `memberships.length > 1`.
9. **`*budojoCan` directive + CTA gating sweep**: walks every page that shows a write CTA, wraps it in the directive.

Each sub-issue carries its own PEST + Vitest + Cypress coverage; no shortcut on the test pyramid for a critical-path security feature.

## 10. Backwards compatibility

- **Existing rows**: data backfill in sub-issue 1 — every `academies.user_id` becomes a `(user_id, academy_id, role: owner)` row in `academy_memberships`. `users.active_academy_id` populated from the academy the user owns.
- **In-flight clients**: the authz rewrite (sub-issue 4) keeps `academies.user_id` pointing at the primary owner, so the existing `Academy::user()` relation still works. No SPA changes are visible until sub-issue 6 ships the Team page.
- **Single-academy environments** (the alpha-tester pool today): zero behaviour change. The switcher (sub-issue 8) is hidden when `memberships.length === 1`.

## 11. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Authz rewrite (sub-issue 4) is a sprawling PR touching every controller | Mechanical change, one pattern; every existing PEST passes at parity (this is the trip-wire); review-paced. |
| Capability matrix drift (backend vs SPA) | Single source of truth: backend ships the matrix as JSON on `/auth/me`; SPA's `*budojoCan` consumes that exact JSON. PEST + Vitest pin the round-trip. |
| Multi-academy users hitting the "wrong academy" by accident | Active-academy switcher in the topbar shows the current academy name prominently. Every page header also shows it. |
| Email-only invitation phishing / spoofing | Token is a 256-bit random + SHA-256 hash; expiry 7 days; one-shot consumption. Same shape as password-reset, already audited. |
| Removing the only owner | Invariant enforced at the model level + at the controller level + by a PEST regression. |

## 12. Decisions (locked)

The five open questions are resolved with the defaults below. The matrix in § 4 is final for v1.

1. **Assistant scope**: kept as written — attendance + mark-paid yes, create-athlete no. Front-desk staff handle the daily flow, but enrollment + onboarding stays with at least an instructor. If alpha-tester feedback shows assistants need to create athletes, we'll add the capability in a follow-up rather than guess up front.
2. **Viewer role**: skipped for v1. The assistant role already covers "show up and check people in"; a pure-read role doesn't have a clear use case the alpha-tester pool has asked for. Add later only if real demand surfaces.
3. **Invitation TTL**: 7 days. The mid-point between the short password-reset window (1h) and the long account-deletion grace (30d). Captures honest forget-to-click-yesterday cases without leaving stale tokens floating for a month.
4. **Owner transfer / removability**: out of scope v1. The matrix already has "change member role" as an owner-only capability so the foundation is there; transferring ownership ships in a follow-up issue once two real users ask for it.
5. **Multi-academy notification**: both email AND in-app. Email opt-out is per-user (the existing `notification_preferences` map gets a new `academy_invitation` key); per-academy opt-out is out of scope.
