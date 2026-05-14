# AcademyInvitation

A pending invitation to join an academy as a team member (#427, PRD: `docs/specs/multi-user.md` § 7). Terminal state (accept or revoke) **hard-deletes** the row — the membership row itself is the canonical audit trail.

## Schema (`academy_invitations`)

| Column                | Type           | Notes |
|-----------------------|----------------|-------|
| `id`                  | bigint PK      | |
| `academy_id`          | bigint FK      | `academies.id`, `ON DELETE CASCADE`. |
| `email`               | varchar(255)   | Target invitee — may not have a Budojo account yet. |
| `role`                | varchar(16)    | Cast to `MembershipRole`. FormRequest validation rejects `owner` (no ownership transfer in v1). |
| `token_hash`          | char(64)       | SHA-256 of the raw URL token. Same shape as Laravel's password-reset table. |
| `invited_by_user_id`  | bigint FK      | `users.id`. Audit of who sent the invite. |
| `expires_at`          | timestamp      | Default `+7 days` from creation. The TTL is configurable per env via `config('teams.invitation_ttl')`. |
| `created_at`, `updated_at` | timestamps | |

### Indexes

- `UNIQUE (academy_id, email)` — one pending invite per `(academy, email)` at a time. Re-inviting an address with a still-pending row 422s at the FormRequest layer.
- `INDEX (token_hash)` — accept-endpoint lookup, constant-time.
- `INDEX (expires_at)` — scanned by the expiry cron.
- `INDEX (email)` — register-with-token lookups.

## Token shape

- Server generates a 256-bit raw random (`Str::random(64)`). Email link carries the raw value: `https://budojo.it/team/invitations/accept?token={raw}`.
- DB stores only `SHA-256(raw)` in `token_hash`. Accept endpoint re-hashes the body's `token` and looks up by `token_hash`.
- Constant-time comparison on lookup (`hash_equals`).

## Business rules

- **No soft-tombstoning.** Acceptance or revocation HARD-DELETES the row. Membership creation IS the audit trail; the invitation's job ends.
- **No `owner` role.** Validation rejects at the input boundary.
- **Per-academy uniqueness.** Same email can be a pending invitee on different academies at the same time (one row each); on the same academy, only one pending invite at a time.

## Relations

- `belongsTo Academy` — `academy_id`.
- `belongsTo User invitedBy` — `invited_by_user_id`. The user who sent the invite.

## Convention notes

- HARD-delete instead of soft-tombstone is deliberate — MySQL 8 doesn't support partial unique indexes (`WHERE accepted_at IS NULL AND revoked_at IS NULL`), so the alternative would have been a trigger; choosing hard-delete keeps the table simpler and the membership row is the audit surface anyway. See `docs/specs/multi-user.md` § 5.2.
