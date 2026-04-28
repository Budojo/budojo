import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Public landing page hit by the backend's `verification.verify` failure
 * redirect (expired link, tampered signature, hash mismatch). Offers a
 * one-click resend if the user is logged in on this device, otherwise
 * routes them back to login. Resend errors surface a toast — a 429
 * cooldown shouldn't silently look like success.
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
  private readonly messageService = inject(MessageService);

  protected readonly canResend = !!this.authService.getToken();
  protected readonly sending = signal(false);

  resend(): void {
    if (!this.canResend || this.sending()) return;
    this.sending.set(true);
    this.authService.resendVerificationEmail().subscribe({
      next: () => {
        this.sending.set(false);
        this.router.navigateByUrl('/dashboard/profile');
      },
      error: (err: unknown) => {
        this.sending.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : null;
        if (status === 429) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Try again in a moment',
            detail: 'For security, you can only request a verification email once per minute.',
          });
          return;
        }
        if (status === 401) {
          // Token went stale between landing here and clicking. Send the user
          // through login; once they re-auth they can request from profile.
          void this.router.navigateByUrl('/auth/login');
          return;
        }
        this.messageService.add({
          severity: 'error',
          summary: 'Couldn’t send email',
          detail: 'Please try again — if it persists, contact support.',
        });
      },
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/auth/login');
  }
}
