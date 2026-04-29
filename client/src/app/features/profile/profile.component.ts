import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { AuthService } from '../../core/services/auth.service';
import { EmailVerificationStatusComponent } from '../../shared/components/email-verification-status/email-verification-status.component';

/**
 * `/dashboard/profile` — minimal user-account surface. MVP scope is just
 * email + verification status + resend. Change-password and friends will
 * land in subsequent issues per the umbrella in #167.
 *
 * Reads `?reason=verify_required` to render an inline explainer banner
 * when the user was bounced here by the auth interceptor catching a
 * `verification_required` 403 from a gated write endpoint.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ButtonModule, CardModule, Toast, EmailVerificationStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  protected readonly user = this.authService.user;
  protected readonly exporting = signal<boolean>(false);

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** True when the auth interceptor bounced here from a gated 403. */
  protected readonly verifyRequired = computed(
    () => this.queryParams().get('reason') === 'verify_required',
  );

  /**
   * GDPR Art. 20 — data portability (#222). Triggers a ZIP download of
   * the user's full dataset (academy + athletes + documents binaries +
   * payments + attendance). Reuses the Blob shape the service returns
   * to drive a temporary anchor click — no backend file path is leaked
   * to the URL bar, and the object URL is revoked the moment the click
   * has been dispatched.
   */
  exportMyData(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.authService.exportMyData('zip').subscribe({
      next: ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: (err: { status?: number }) => {
        const detail =
          err.status === 429
            ? 'Hai già scaricato i dati di recente. Riprova fra un minuto.'
            : 'Non è stato possibile scaricare i tuoi dati. Riprova.';
        this.messageService.add({ severity: 'error', summary: 'Errore', detail });
        this.exporting.set(false);
      },
    });
  }
}
