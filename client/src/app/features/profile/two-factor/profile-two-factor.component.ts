import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
// qrcode loaded lazily on first enrolment (#877). It's a CommonJS
// dependency (build warning: optimization bailout); dynamic-import
// keeps it out of the profile-page chunk for users who never enable
// 2FA. Type-only import keeps the call site type-checked.
import type * as QRCodeType from 'qrcode';
import {
  TwoFactorEnrolment,
  TwoFactorService,
  TwoFactorStatus,
} from '../../../core/services/two-factor.service';

/**
 * "Two-factor authentication" panel on `/dashboard/profile` (#412).
 *
 * Renders one of three states based on `TwoFactorStatus`:
 *
 * - **Not enrolled** — single "Enable" CTA. Pressing it mints a TOTP
 *   secret on the server and flips to "Pending confirmation" without
 *   leaving the page.
 * - **Pending confirmation** — QR code + plaintext secret + 6-digit
 *   TOTP entry. Posting a valid code activates 2FA and surfaces the
 *   8 backup codes ONCE in a dialog the user must explicitly
 *   acknowledge before dismissing.
 * - **Active** — green status, count of remaining backup codes,
 *   "Regenerate codes" + "Disable" actions. Disable requires the
 *   current password (re-auth gate).
 */
@Component({
  selector: 'app-profile-two-factor',
  standalone: true,
  imports: [
    ButtonModule,
    DialogModule,
    InputTextModule,
    PasswordModule,
    ProgressSpinnerModule,
    ReactiveFormsModule,
    TooltipModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-two-factor.component.html',
  styleUrl: './profile-two-factor.component.scss',
})
export class ProfileTwoFactorComponent implements OnInit {
  private readonly twoFactorService = inject(TwoFactorService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly status = signal<TwoFactorStatus | null>(null);
  protected readonly enrolment = signal<TwoFactorEnrolment | null>(null);
  protected readonly qrDataUrl = signal<string | null>(null);
  protected readonly enrolling = signal<boolean>(false);
  protected readonly confirming = signal<boolean>(false);
  protected readonly regenerating = signal<boolean>(false);
  protected readonly disabling = signal<boolean>(false);
  protected readonly confirmCodeError = signal<string | null>(null);
  protected readonly disablePasswordError = signal<string | null>(null);

  // Recovery codes dialog — surfaced ONCE after a successful confirm
  // OR regenerate. Plaintext codes, must be copied off elsewhere
  // before dismissal. Backed by a separate signal so the dialog
  // doesn't survive a status refresh.
  protected readonly recoveryCodes = signal<readonly string[] | null>(null);
  protected readonly recoveryDialogOpen = signal<boolean>(false);
  protected readonly disableDialogOpen = signal<boolean>(false);

  // Enrolment-confirmation accepts ONLY the 6-digit TOTP; backup
  // codes can't be used to complete enrolment. Matches the server's
  // `size:6` rule on `POST /me/two-factor/confirm`.
  protected readonly confirmForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
  });

  protected readonly disableForm = this.fb.nonNullable.group({
    password: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.twoFactorService.status().subscribe({
      next: (s) => {
        this.status.set(s);
        this.loading.set(false);
        // Pre-warm the lazy `qrcode` chunk (#877) as soon as we know 2FA
        // isn't active yet, so the otpauth→data-URL render is instant on
        // Enable instead of racing a first-request cold chunk load. On a
        // cold `ng serve` (CI) the QR <img> otherwise misses its render
        // window even though enrolment + secret already painted. Fire-and-
        // forget; the module loader caches the promise for onEnable's import.
        if (!s.enabled) {
          void import('qrcode').catch(() => undefined);
        }
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onEnable(): void {
    this.enrolling.set(true);
    this.twoFactorService.enrol().subscribe({
      next: (data) => {
        this.enrolment.set(data);
        // Render the otpauth:// URI as a data: URL SVG (the dataURL
        // helper returns base64-encoded SVG that fits a normal <img>
        // src — no <canvas> dependency, scales freely).
        //
        // Dynamic import keeps qrcode out of the profile-page chunk
        // for users who never enable 2FA (#877). The promise is
        // cached at module level by the JS loader so subsequent
        // enrolments don't re-fetch the chunk.
        import('qrcode')
          .then((QRCode: typeof QRCodeType) =>
            QRCode.toDataURL(data.provisioning_uri, { margin: 1, scale: 4 }),
          )
          .then((url) => this.qrDataUrl.set(url))
          .catch(() => this.qrDataUrl.set(null));
        this.status.set({ enabled: false, pending: true, recovery_codes_remaining: 0 });
        this.enrolling.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.enrolling.set(false);
        if (err.status === 422) {
          // The server already has an active 2FA setup — refresh to
          // pull the current shape, the user will see the "Active"
          // pane instead.
          this.refresh();
          return;
        }
        this.toastGenericError();
      },
    });
  }

  protected submitConfirm(): void {
    this.confirmCodeError.set(null);
    if (this.confirmForm.invalid) {
      this.confirmCodeError.set('profile.twoFactor.confirmCodeRequired');
      return;
    }
    this.confirming.set(true);
    this.twoFactorService.confirm(this.confirmForm.controls.code.value).subscribe({
      next: (codes) => {
        this.confirming.set(false);
        this.confirmForm.reset();
        this.recoveryCodes.set(codes);
        this.recoveryDialogOpen.set(true);
        this.enrolment.set(null);
        this.qrDataUrl.set(null);
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.confirming.set(false);
        if (err.status === 422) {
          this.confirmCodeError.set('profile.twoFactor.confirmCodeInvalid');
          return;
        }
        this.toastGenericError();
      },
    });
  }

  protected onRegenerateCodes(): void {
    this.regenerating.set(true);
    this.twoFactorService.regenerateRecoveryCodes().subscribe({
      next: (codes) => {
        this.regenerating.set(false);
        this.recoveryCodes.set(codes);
        this.recoveryDialogOpen.set(true);
        this.refresh();
      },
      error: () => {
        this.regenerating.set(false);
        this.toastGenericError();
      },
    });
  }

  protected openDisableDialog(): void {
    this.disableForm.reset();
    this.disablePasswordError.set(null);
    this.disableDialogOpen.set(true);
  }

  protected submitDisable(): void {
    this.disablePasswordError.set(null);
    if (this.disableForm.invalid) {
      this.disablePasswordError.set('profile.twoFactor.disablePasswordRequired');
      return;
    }
    this.disabling.set(true);
    this.twoFactorService.disable(this.disableForm.controls.password.value).subscribe({
      next: () => {
        this.disabling.set(false);
        this.disableDialogOpen.set(false);
        this.disableForm.reset();
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.twoFactor.disabledSummary'),
          detail: this.translate.instant('profile.twoFactor.disabledDetail'),
        });
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.disabling.set(false);
        if (err.status === 422) {
          this.disablePasswordError.set('profile.twoFactor.disablePasswordWrong');
          return;
        }
        this.toastGenericError();
      },
    });
  }

  protected closeRecoveryDialog(): void {
    this.recoveryDialogOpen.set(false);
    this.recoveryCodes.set(null);
  }

  protected copyRecoveryCodes(): void {
    const codes = this.recoveryCodes();
    if (codes === null) {
      return;
    }
    void navigator.clipboard.writeText(codes.join('\n'));
    this.messageService.add({
      severity: 'info',
      summary: this.translate.instant('profile.twoFactor.codesCopiedSummary'),
    });
  }

  private toastGenericError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant('profile.twoFactor.genericErrorSummary'),
      detail: this.translate.instant('profile.twoFactor.genericErrorDetail'),
    });
  }
}
