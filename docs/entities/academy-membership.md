# AcademyMembership

One row per `(user, academy)` pair the user has been added to. Drives every authz check in the multi-user epic (#427, PRD: `docs/specs/multi-user.md`).

## Schema (`academy_memberships`)

| Column        | Type           | Notes |
|---------------|----------------|-------|
| `id`          | bigint PK      | |
| `user_id`     | bigint FK      | `users.id`, `ON DELETE CASCADE`. |
| `academy_id`  | bigint FK      | `academies.id`, `ON DELETE CASCADE`. |
| `role`        | varchar(16)    | Cast to `MembershipRole`. One of `owner` / `admin` / `instructor` / `assistant`. |
| `joined_at`   | timestamp      | Set on row creation. Reused as-is by the backfill migration from the academy's `created_at`. |
| `revoked_at`  | timestamp NULL | Soft-revoke. Row stays for the audit trail; the active-memberships scope filters `WHERE revoked_at IS NULL`. |
| `created_at`, `updated_at` | timestamps | |

### Indexes

- `UNIQUE (user_id, academy_id)` — one membership row per `(user, academy)`. A revoked row still occupies the slot; re-adding flips `revoked_at` back to `NULL` (UPDATE, not INSERT).
- `INDEX (academy_id, role)` — list-members + capability lookups.
- `INDEX (revoked_at)` — active-memberships filter.

## Business rules

- **Every academy MUST have exactly one active `owner` membership.** Enforced by `App\Actions\Membership\RevokeMembershipAction` (sub-issue 5/9 of the multi-user epic) — the action re-counts active owners before persisting a revoke and refuses the operation if it would zero them out.
- **No `owner` invitations.** The invitation FormRequest validates `role ∈ {admin, instructor, assistant}`. Transferring ownership is out of scope v1.
- **Cascade behaviour.** Hard-deleting a user OR an academy cascades to drop their membership rows.

## Relations

- `belongsTo User` — `user_id`.
- `belongsTo Academy` — `academy_id`.

## Convention notes

- The `role` column is `varchar(16)` (not native MySQL `ENUM`) so adding a future role value is a code-only change. Matches the existing `users.role`, `athletes.belt`, `athletes.status` convention.
- The `MembershipRole` enum lives at `App\Enums\MembershipRole` and is intentionally distinct from `App\Enums\UserRole` (persona discriminator on `users.role`): `MembershipRole::Owner` ≠ `UserRole::Owner`. See `docs/specs/multi-user.md` § 2.
