import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Athlete-side profile page (#610, M7 PR-D slice 1). Read-only view of
 * the user's own contact info — first name, last name, full name,
 * handle, email + verification state, avatar.
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
