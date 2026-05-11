import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BeltBadgeComponent } from '../belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
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
 * The component is presentation-only; the parent decides what data
 * to render. Two places consume it today: MyFeedComponent (per-post
 * author line) and the comments thread mounted under each card.
 * Third caller will trigger the Rule-of-Three extraction of the
 * `Belt` cell into its own variant.
 */
@Component({
  selector: 'app-user-flair',
  standalone: true,
  imports: [UserAvatarComponent, BeltBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-flair.component.html',
  styleUrl: './user-flair.component.scss',
})
export class UserFlairComponent {
  readonly user = input.required<UserFlairShape>();
  readonly compact = input<boolean>(false);
}
