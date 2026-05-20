import type { User } from '../../core/services/auth.service';

/**
 * Role-aware base path for a public-profile router link.
 *
 * Athletes land on `/dashboard/me/u/<handle>` (their shell, gated by
 * `roleAthleteGuard`); owners land on `/dashboard/u/<handle>` (gated by
 * `roleOwnerGuard`). Linking to the opposite shell's route would have
 * the guard redirect the user away from the page they tapped.
 *
 * Extracted from the duplicate `computed()` bodies that appeared in
 * `MentionTextComponent`, `UserFlairComponent`, and `MyFeedComponent`
 * during the post-v2.22.1 discoverability work. Single source of
 * truth; defaults to the owner path when the cached user is null
 * (matches the existing fallback in `auth-guards`).
 */
export function profileBaseForUser(user: Pick<User, 'role'> | null | undefined): string {
  return user?.role === 'athlete' ? '/dashboard/me/u' : '/dashboard/u';
}
