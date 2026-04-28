import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../../core/services/auth.service';

const AUTO_REDIRECT_MS = 3000;

/**
 * Public landing page hit by the backend's `verification.verify` redirect on
 * success. Re-hydrates the user (so the topbar pill flips to "verified" if
 * they're still logged in on this device) and auto-bounces to the dashboard.
 */
@Component({
  selector: 'app-verify-success',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-success.component.html',
  styleUrl: './verify-success.component.scss',
})
export class VerifySuccessComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private redirectTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // If a token is in localStorage (the user is still logged in on this
    // browser), refresh the cached user so the verified pillola flips
    // immediately. If not (cross-device click), this no-ops via 401 — the
    // success page still renders for the read-only case.
    if (this.authService.getToken()) {
      this.authService.loadCurrentUser().subscribe({ error: () => undefined });
    }

    this.redirectTimeout = setTimeout(() => this.goToDashboard(), AUTO_REDIRECT_MS);
  }

  ngOnDestroy(): void {
    this.clearRedirectTimeout();
  }

  goToDashboard(): void {
    // Cancel the pending auto-redirect — without this, a manual click
    // would still leave the 3s timer armed, and if the user navigated
    // elsewhere in that window they'd be yanked back to the dashboard
    // (#174 follow-up to #173 review).
    this.clearRedirectTimeout();
    this.router.navigateByUrl('/dashboard/athletes');
  }

  private clearRedirectTimeout(): void {
    if (this.redirectTimeout !== null) {
      clearTimeout(this.redirectTimeout);
      this.redirectTimeout = null;
    }
  }
}
