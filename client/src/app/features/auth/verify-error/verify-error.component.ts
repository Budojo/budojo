import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Public landing page hit by the backend's `verification.verify` failure
 * redirect (expired link, tampered signature, hash mismatch). Offers a
 * one-click resend if the user is logged in on this device, otherwise
 * routes them back to login.
 */
@Component({
  selector: 'app-verify-error',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-error.component.html',
  styleUrl: './verify-error.component.scss',
})
export class VerifyErrorComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly canResend = !!this.authService.getToken();

  resend(): void {
    if (!this.canResend) return;
    this.authService.resendVerificationEmail().subscribe({
      next: () => this.router.navigateByUrl('/dashboard/profile'),
      error: () => this.router.navigateByUrl('/dashboard/profile'),
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/auth/login');
  }
}
