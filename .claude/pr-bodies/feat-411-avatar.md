## What

User avatar upload + replace + remove — surfaced on `/dashboard/profile`
plus a chip in the dashboard topbar (mobile only, mirroring Jakob's Law:
top-right user chip is the universal "manage my account" affordance).

Closes #411.

## Why

User profiles had no avatar today. The header bar and profile page rendered
initials only — fine while every academy is single-tenant, unreadable the
moment a multi-user view enters the picture.

## How

Mirrors the academy-logo flow end-to-end. New surfaces:

**Server**

- `database/migrations/2026_05_05_120000_add_avatar_path_to_users_table.php`
  — nullable `users.avatar_path` column.
- `App\Actions\User\UploadAvatarAction` — re-encodes the upload to a
  256x256 center-cropped JPEG via raw GD (already compiled into the API
  container; Intervention Image isn't in `composer.json`). Stores at
  `users/avatars/{user-id}.jpg` on the `public` disk. Deterministic path
  means a replace overwrites in place — no orphan from the previous file.
- `App\Actions\User\DeleteAvatarAction` — unlinks + clears `avatar_path`.
  Idempotent (no-op on already-null).
- `App\Http\Requests\User\UploadAvatarRequest` — `image` rule + `mimes:jpeg,jpg,png,webp` + `max:2048` KB. SVG explicitly out of scope (the
  academy-logo flow needed a hand-rolled sanitiser; head-shots don't
  justify that surface).
- `App\Http\Controllers\User\AvatarController::{upload,delete}` — thin,
  delegates to the actions, returns `UserResource` so the SPA can swap
  its cached `/auth/me` envelope without a follow-up round-trip.
- `App\Models\User` — `avatar_path` in `#[Fillable]`, `getAvatarUrlAttribute()` accessor that resolves through `Storage::disk('public')->url(...)` (mirrors `AcademyResource::logo_url`).
- `App\Http\Resources\UserResource` — emits `avatar_url` (the URL, never
  the raw path).
- Routes: `POST /api/v1/me/avatar`, `DELETE /api/v1/me/avatar`.

**Client**

- `core/services/auth.service.ts` — `User.avatar_url`, `uploadAvatar(file)`,
  `removeAvatar()`. Both swap the cached `user` signal in `tap()` so every
  consumer (topbar chip, profile card, future sidebar slot) sees the new
  value in the same tick.
- `shared/components/user-avatar/` — new presentational component. Takes
  `url`, `name`, `size` ('chip' | 'card'). Renders the image when `url` is
  truthy, otherwise a deterministic initials fallback (`Mario Rossi` →
  `MR`, `Cher` → `C`, empty → `?`).
- `features/dashboard/dashboard.component.html` — topbar avatar chip
  linking to `/dashboard/profile` (mobile-only; the topbar is hidden at
  ≥ 768 px).
- `features/profile/profile.component.{ts,html,scss}` — avatar card with
  Upload / Replace / Remove (confirm-popup). Shape matches the academy-logo
  card byte-for-byte so the two surfaces feel like the same affordance.

**Docs / i18n**

- `docs/entities/user.md` — `avatar_path` column + business rule.
- `docs/api/v1.yaml` — `User.avatar_url`, `POST /me/avatar`,
  `DELETE /me/avatar`.
- `client/public/assets/i18n/{en,it}.json` — `nav.profileAriaLabel`,
  `profile.avatarTitle/Hint/Alt/Upload/Replace/Remove`,
  `profile.avatarToast.*`, `profile.avatarConfirm.*` (EN + IT in lock-step).

## Decisions

1. **Raw GD over Intervention Image.** Intervention is the obvious choice
   but it's not in `composer.json` today; the GD extension is already
   compiled into the API container. For one square-crop + resize the GD
   primitives do everything we need with no new dependency. Revisit the
   day a second feature wants richer image manipulation (escape-hatch in
   `server/CLAUDE.md` § Patterns we explicitly reject).
2. **256x256 output.** Big enough for a Retina header chip (DPR 2 on a
   96 px slot) and the profile-card disc; small enough that the on-disk
   footprint is ~10–30 KB per user.
3. **`users/avatars/{id}.jpg` storage layout.** Deterministic path per
   user, single output extension regardless of input. A replace overwrites
   in place — no orphan, no extension-mismatch dangling file. Server tests
   assert exactly one file lives in the directory after a replace.
4. **JPEG output (forced).** PNG / WebP transparency flattens to white
   before re-encode. JPEG quality 85 is the standard sweet spot.
5. **SVG rejected.** Avatar surface intentionally rejects SVG; the
   academy-logo flow already pays the cost of a hand-rolled sanitiser
   and head-shots don't justify replicating that.
6. **Topbar chip is mobile-only.** Desktop has the static sidebar; adding
   the chip there would duplicate the future avatar slot in the sidebar
   header (out of scope here).
7. **Idempotent delete** — mirrors `DeleteAcademyLogoAction`. A
   refresh-after-toast pattern in the SPA can't paper over a stale 404.

## Out of scope

- Cropping UI (spec calls it out — the server's center-crop is the only
  transform).
- Gravatar fallback.
- User soft-delete cleanup hook (user soft-delete doesn't currently
  exist; doc note added in `docs/entities/user.md`).
- Desktop sidebar avatar slot (would duplicate the topbar chip's purpose
  on a different surface; future iteration once the sidebar header gets
  re-thought).

## References

- Issue: #411
- Precedent: `App\Http\Controllers\Academy\AcademyController::uploadLogo`,
  `App\Actions\Academy\{UploadAcademyLogoAction,DeleteAcademyLogoAction}`,
  `client/src/app/features/academy/detail/academy-detail.component.{ts,html}`
- Tests: `server/tests/Feature/User/AvatarTest.php`,
  `client/src/app/shared/components/user-avatar/user-avatar.component.spec.ts`,
  `client/src/app/features/profile/profile.component.spec.ts`,
  `client/cypress/e2e/profile-avatar.cy.ts`

## Test plan

- [ ] CI: PHPStan level 9 — green
- [ ] CI: PHP CS Fixer — green
- [ ] CI: PEST 4 (`AvatarTest` covers upload, replace, oversize 422,
      bad-MIME 422, SVG 422, unauthenticated 401, delete, idempotent
      delete, `/auth/me` parity for both states, plus a 256x256 JPEG
      pixel-dimension assertion)
- [ ] CI: Vitest 4 (`UserAvatarComponent` initials cases + image
      rendering; `ProfileComponent` upload/replace UI, oversize/MIME
      guards, error toast, in-flight loading state)
- [ ] CI: Cypress 13 (`profile-avatar.cy.ts` happy path: empty state →
      upload → topbar chip update → confirm-remove → fallback)
- [ ] CI: ESLint + Prettier — green
- [ ] CI: OpenAPI Spectral — green
- [ ] Manual smoke: docker compose up, `php artisan migrate`, upload an
      avatar, verify `/storage/users/avatars/{id}.jpg` exists, replace
      it, hard-refresh `/dashboard/profile` and confirm the new image
      survives, hit `DELETE /me/avatar`, confirm fallback initials
      render in the topbar chip.
