import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BeltBadgeComponent } from '../belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { AuthService } from '../../../core/services/auth.service';
import { profileBaseForUser } from '../../utils/profile-base';
import type { Belt } from '../../../core/services/athlete.service';

/**
 * Subset of the wire shape we render — exactly what every
 * "community author" surface needs (feed cards, comments, future
 * RSVP rows). Matches `CommunityPostAuthor` on the server side and
 * the `CommunityPost.created_by` / `PostComment.created_by` fields
 * on the SPA side.
 */
export interface UserFlairShape {
  readonly first_name: string;
  readonly last_name: string;
  readonly full_name: string;
  readonly handle: string | null;
  readonly avatar_url: string | null;
  readonly belt: Belt | null;
}

/**
 * Shared identity flair (#604 M9 PR-D2). Renders the
 * "Mario Rossi · @mariobjj · 🟦 Blue" line — name, optional handle,
 * optional belt — used on every community surface (feed cards,
 * comments, RSVPs).
 *
 * Variant `compact` (default `false`) drops the avatar — used inside
 * comment rows where the avatar would be visually noisy under the
 * parent post's bigger avatar.
 *
 * Tappable when the author has a handle (post-v2.22.1). The entire
 * flair surface becomes a router link to the public-profile page —
 * `/dashboard/u/<handle>` for owners, `/dashboard/me/u/<handle>` for
 * athletes (the opposite shell's route is role-guarded). When the
 * author has no handle yet, the flair stays as plain text.
 */
@Component({
  selector: 'app-user-flair',
  standalone: true,
  imports: [RouterLink, UserAvatarComponent, BeltBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-flair.component.html',
  styleUrl: './user-flair.component.scss',
})
export class UserFlairComponent {
  private readonly authService = inject(AuthService);

  readonly user = input.required<UserFlairShape>();
  readonly compact = input<boolean>(false);

  /**
   * Displayed name. When the user has a handle, the canonical
   * public identifier IS the handle, so the name row stays as
   * `full_name`. When there is no handle, we fall back to
   * "first-name + last-initial" (`Mario R.`) — privacy-leaning
   * per M9 PRD § Component spec, "No handle" fallback. Trailing
   * full-stop on the initial keeps the visual cue that it's
   * truncated.
   */
  readonly displayName = computed<string>(() => {
    const u = this.user();
    if (u.handle !== null && u.handle !== '') {
      return u.full_name;
    }
    const last = (u.last_name ?? '').trim();
    const initial = last.length > 0 ? `${last.charAt(0).toUpperCase()}.` : '';
    return [u.first_name, initial].filter((s) => s.length > 0).join(' ');
  });

  protected readonly profileBase = computed<string>(() =>
    profileBaseForUser(this.authService.user()),
  );
}
