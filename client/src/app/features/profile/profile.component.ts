import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { AuthService } from '../../core/services/auth.service';
import { EmailVerificationStatusComponent } from '../../shared/components/email-verification-status/email-verification-status.component';

/**
 * `/dashboard/profile` — minimal user-account surface. MVP scope is just
 * email + verification status + resend. Change-password and friends will
 * land in subsequent issues per the umbrella in #167.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CardModule, EmailVerificationStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly authService = inject(AuthService);
  protected readonly user = this.authService.user;
}
