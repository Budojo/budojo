import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/services/auth.service';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Compact verification status pill — used in the dashboard sidebar AND on
 * the profile page. Two states:
 *
 *  - `verified`: muted-green tile, "Email verified", non-interactive.
 *  - `unverified`: muted-amber tile, "Verify email" button. Click triggers
 *    `AuthService.resendVerificationEmail()`, shows a toast, and starts a
 *    60s cooldown to short-circuit the server's 1/min throttle (mirroring
 *    the rate limit so the user doesn't hit a 429 round-trip when mashing).
 *
 * Reads `user()` from `AuthService` directly. The hosting templates don't
 * need to wire anything — drop `<app-email-verification-status>` and go.
 *
 * The component does NOT mount its own `<p-toast>` and does NOT provide
 * its own `MessageService`. It injects the application-level service
 * (provided in `app.config.ts`) and relies on the dashboard shell's
 * single toast host. Mounting one toast per pillola would otherwise
 * double-render the top-right slot when the sidebar pillola and the
 * profile page pillola are both mounted (#171 review).
 */
@Component({
  selector: 'app-email-verification-status',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './email-verification-status.component.html',
  styleUrl: './email-verification-status.component.scss',
})
export class EmailVerificationStatusComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);

  /** Cooldown countdown in seconds. 0 = button enabled. */
  protected readonly cooldown = signal(0);
  /** Loading state during the actual HTTP round-trip. */
  protected readonly sending = signal(false);

  protected readonly user = this.authService.user;
  protected readonly verified = this.authService.isEmailVerified;
  protected readonly canResend = computed(() => !this.sending() && this.cooldown() === 0);

  private intervalRef: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.clearInterval();
  }

  protected resend(): void {
    if (!this.canResend()) return;
    this.sending.set(true);
    this.authService.resendVerificationEmail().subscribe({
      next: () => {
        this.sending.set(false);
        this.startCooldown();
        this.messageService.add({
          severity: 'success',
          summary: 'Email sent',
          detail: 'Check your inbox — the verification link is on its way.',
        });
      },
      error: (err) => {
        this.sending.set(false);
        // Show a friendly toast for the throttled case; let the global
        // interceptor surface generic 5xx errors uniformly.
        if (err?.status === 429) {
          this.startCooldown();
          this.messageService.add({
            severity: 'warn',
            summary: 'Try again in a moment',
            detail: 'For security, you can only request a verification email once per minute.',
          });
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

  private startCooldown(): void {
    this.cooldown.set(RESEND_COOLDOWN_SECONDS);
    this.clearInterval();
    this.intervalRef = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(next);
      if (next <= 0) this.clearInterval();
    }, 1000);
  }

  private clearInterval(): void {
    if (this.intervalRef !== null) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }
}
