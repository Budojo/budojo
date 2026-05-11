import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Athlete-side profile page (#610, M7 PR-D slice 1). Read-only view of
 * the user's own contact info — first name, last name, handle (with a
 * "no username set yet" fallback when null), email + verified/unverified
 * badge.
 *
 * NOT rendered in V1: full_name (the first/last fields are enough on
 * this page; full_name is a server-side concatenation used elsewhere),
 * avatar (sits in the sidebar via AthleteDashboardComponent, not on
 * this content page).
 *
 * Edit lands in Slice 4. Belt + linked athlete data lands when the
 * MyAcademy / MyAttendance pages arrive (Slice 2) — those rely on a
 * separate athlete-row endpoint that doesn't exist for the athlete
 * persona yet.
 */
@Component({
  selector: 'app-me-profile',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './me-profile.component.html',
  styleUrl: './me-profile.component.scss',
})
export class MeProfileComponent {
  private readonly authService = inject(AuthService);

  protected readonly user = this.authService.user;
}
