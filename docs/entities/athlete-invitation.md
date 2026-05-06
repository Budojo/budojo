# Entity — `AthleteInvitation`

## Purpose

Token-based invitation row that lets an academy owner onboard a roster athlete to the SPA (#445, M7 PR-A). The owner clicks "Invita al sistema" on the athlete detail page; a row is persisted here, an email goes out, and the athlete completes the invite by clicking the signed link.

The row is **the auditable trail of the invitation**, distinct from the email itself: a queue blip that loses the mail does NOT lose the invitation. The owner can resend (`last_sent_at` bumps), revoke (`revoked_at` set), or watch it expire (`expires_at` past, no `accepted_at`). The lifecycle is encoded in the column triplet rather than a `status` enum so existing queries on the row stay portable across future state additions.

## Why a row, not just a signed URL

Laravel's `URL::temporarySignedRoute()` could in principle stamp the entire invite into the URL itself (athlete id + expiry + signature) without persisting anything. Three things make the row mandatory:

- **Revocation.** A pure-signed URL cannot be invalidated before its expiry without rotating `APP_KEY` (which would invalidate every other signed URL too). The row gives us `revoked_at`.
- **Resend without spawning parallel live tokens.** Bumping `last_sent_at` AND replacing the stored token hash on the same row keeps a single bearer credential alive at any moment — the URL emitted on the previous send is invalidated, the new email always carries the only working URL. Same shape as Laravel's password-reset flow. Without the row we'd need either a fresh signed URL each time (and orphan the previous one anyway) or a parallel-row design that doubles the bearer-credential surface.
- **Audit trail.** "When did Luigi invite Mario? Did Mario ever accept?" — answerable in O(1) without rummaging through Resend's outbound logs.

## Schema — `athlete_invitations`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, cascade on delete, **indexed** | The roster row this invite is for. Cascade because a hard-deleted athlete can't have orphan invitations. |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete, **indexed** | Tenant scoping. Cascade for the same reason. |
| `sent_by_user_id` | bigint unsigned | FK `users.id`, cascade on delete | The owner that pressed "Invita". Cascade so a hard-deleted owner doesn't leave dangling FKs. |
| `email` | string(255) | not null | Snapshot of the athlete's email at invite time. Persisted alongside the dereferenced `athletes.email` because the athlete row's email can change after the invite is sent — and we want the "we emailed THIS address on THAT date" trail intact. |
| `token` | string(64) | not null, **unique** | SHA-256 hex digest of a 64-char URL-safe random raw token. The raw token is emitted in the invite URL exactly ONCE (the email body) and never persisted. The `/athlete-invite/{token}/accept` endpoint hashes the URL-presented value and looks up by hash, so a DB read leak does not yield live bearer credentials. See `AthleteInvitation::hashToken()` for the helper used on both sides. |
| `expires_at` | timestamp | not null | Default 7 days from insert. The action sets the actual value so a future config-driven window is one edit away. |
| `accepted_at` | timestamp | nullable | Set in `AcceptAthleteInvitationAction` when the athlete clicks + sets a password + ticks ToS. |
| `revoked_at` | timestamp | nullable | Set by the owner before the athlete accepts. |
| `last_sent_at` | timestamp | nullable | Bumped on resend; defaults to `created_at` on insert. |
| `created_at` | timestamp | not null | |
| `updated_at` | timestamp | not null | |

## Lifecycle states

States are **derived** from the column triplet, not stored. Helpers on the model (`isPending()`, `isAccepted()`, `isRevoked()`, `isExpired()`) and scopes (`pending()`, `expired()`) encapsulate the rules:

- **pending** — `accepted_at IS NULL` AND `revoked_at IS NULL` AND `expires_at > now()`. Listed on the athlete detail page; consumes the resend / revoke buttons.
- **accepted** — `accepted_at IS NOT NULL`. The linked athlete now has a `users.id`. Terminal.
- **revoked** — `revoked_at IS NOT NULL`. Owner cancelled before accept. Terminal.
- **expired** — `accepted_at IS NULL` AND `revoked_at IS NULL` AND `expires_at <= now()`. Terminal.

A row in any terminal state is never deleted — keeping it around makes the audit trail honest. The owner can always resend by creating a fresh row OR (in PR-B) by reusing the most recent pending row's token.

## Relations

- `belongsTo(Athlete::class)` — inverse of `Athlete::invitations()`.
- `belongsTo(Academy::class)` — tenant scoping.
- `belongsTo(User::class, 'sent_by_user_id')` — exposed as `$invitation->sentBy`.

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(token)` — single lookup point for the accept endpoint.
- `INDEX(athlete_id, accepted_at, revoked_at)` — drives the "pending invites for this athlete" query on the detail page.
- `INDEX(email)` — for the anti-squatting check at owner-side invite time ("does this email already have a pending invite anywhere?").
- `INDEX(expires_at)` — for periodic cleanup / monitoring of expired-but-not-revoked rows.

## Business rules

These rules will be enforced in M7 PR-B's `SendAthleteInvitationAction` and PR-C's `AcceptAthleteInvitationAction`. PR-A only wires the schema + model.

- **One pending invite per athlete at a time.** A second "Invita" click on an athlete with an active pending invite re-uses the existing row (bumps `last_sent_at` + re-queues the mail) instead of creating a parallel row.
- **No invite if the athlete has no email.** The owner-side button is disabled with a tooltip when `athletes.email` is null. The action returns 422 if called anyway.
- **No invite if the email already has a User.** Anti-squatting / safety: if `users.email` already exists for this address, the owner gets a 422 with `email_already_registered` so they know the path forward (the existing user can sign in directly; if it's actually a different person who happened to register first, the owner has to coordinate out of band).
- **Token is the auth at accept time.** The accept endpoint does NOT require any other credential — clicking the link IS the proof of email ownership. Sets `users.email_verified_at = now()` on the new row, skipping the M5 verify-email second step that public-register users go through.
- **Idempotent under double-click.** Submitting the accept form twice does not 500 — the second request 410s (Gone) because `accepted_at` is already set.

## Related endpoints (M7 PR-B + PR-C)

- `POST /api/v1/athletes/{athlete}/invite` — creates an invitation (or bumps `last_sent_at` if pending exists). Owner only.
- `POST /api/v1/athletes/{athlete}/invite/resend` — bumps `last_sent_at` and re-queues the mail. Owner only.
- `DELETE /api/v1/athletes/{athlete}/invitations/{invitation}` — sets `revoked_at`. Owner only.
- `GET /api/v1/athlete-invite/{token}/preview` — returns athlete + academy info for the SPA pre-fill (no auth required).
- `POST /api/v1/athlete-invite/{token}/accept` — creates the `User` row, links `athletes.user_id`, sets `accepted_at`, returns a Sanctum token.

## Out of scope (future milestones)

- **Multi-email invites.** Today one email per row. A future "send the invite to the parent's email if the athlete is a minor" flow would need a polymorphic recipient column or a sibling table.
- **Reminder emails.** No automatic "you have an unaccepted invite" follow-up — the owner re-clicks Invita if they want to nudge.
- **Self-invite revocation.** The athlete cannot revoke their own pending invite from the email link; only the owner can. Edge case; not worth a public endpoint until someone asks.
