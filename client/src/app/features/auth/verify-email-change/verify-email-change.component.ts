import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';

const AUTO_REDIRECT_MS = 2000;

type ViewState = 'loading' | 'success' | 'error';

/**
 * Public landing page reached by the verification link in the
 * `EmailChangeVerificationMail` body (#476). Lives outside the
 * dashboard shell because:
 *
 * 1. The user is not necessarily authenticated when they click the
 *    link (they may be reading the email on a different device than
 *    the one they were signed in on); the dashboard guards would
 *    bounce them.
 * 2. The page wants a single-task focused layout — confirm-and-bounce.
 *
 * On mount the component POSTs the URL token to the verify endpoint:
 *
 * - 200 → success panel + 2s auto-redirect to `/auth/login` with a
 *   toast hint ("Email confirmed, sign in with the new address"). We
 *   deliberately do NOT auto-login the user (server-side anti-leak
 *   choice); if the legitimate user is on a different device, having
 *   to sign in again with the new address closes the loop without
 *   leaking a session via the URL.
 * - 410 → error panel with "Back to profile" / "Back to sign in" CTA
 *   (the choice is wired to whether a Sanctum token sits in
 *   localStorage — a logged-in user goes to /dashboard/profile, a
 *   stranger goes to /auth/login).
 */
@Component({
  selector: 'app-verify-email-change',
  standalone: true,
  imports: [ButtonModule, ProgressSpinnerModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-email-change.component.html',
  styleUrl: './verify-email-change.component.scss',
})
export class VerifyEmailChangeComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly state = signal<ViewState>('loading');

  /**
   * Where the user goes when they click the error CTA. A logged-in
   * user gets back to their profile (so they can request a fresh link
   * via the inline pencil); a stranger lands on the sign-in page.
   * Computed once at error time so a token expiring mid-render
   * doesn't change the destination.
   */
  protected readonly errorBackTarget = signal<'/dashboard/profile' | '/auth/login'>('/auth/login');

  private redirectTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (token === null || token === '') {
      this.state.set('error');
      this.errorBackTarget.set(this.authService.getToken() ? '/dashboard/profile' : '/auth/login');
      return;
    }

    this.authService.verifyEmailChange(token).subscribe({
      next: () => {
        this.state.set('success');
        this.scheduleRedirect();
      },
      error: () => {
        this.state.set('error');
        this.errorBackTarget.set(
          this.authService.getToken() ? '/dashboard/profile' : '/auth/login',
        );
      },
    });
  }

  ngOnDestroy(): void {
    this.clearRedirectTimeout();
  }

  private scheduleRedirect(): void {
    this.redirectTimeout = setTimeout(() => {
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('account.emailChange.verify.loginToast.summary'),
        detail: this.translate.instant('account.emailChange.verify.loginToast.detail'),
        life: 5000,
      });
      void this.router.navigateByUrl('/auth/login');
    }, AUTO_REDIRECT_MS);
  }

  private clearRedirectTimeout(): void {
    if (this.redirectTimeout !== null) {
      clearTimeout(this.redirectTimeout);
      this.redirectTimeout = null;
    }
  }
}
