import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { EmailVerificationStatusComponent } from '../../shared/components/email-verification-status/email-verification-status.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * `/dashboard/profile` — minimal user-account surface. MVP scope is just
 * email + verification status + resend. Change-password and friends will
 * land in subsequent issues per the umbrella in #167.
 *
 * Reads `?reason=verify_required` to render an inline explainer banner
 * when the user was bounced here by the auth interceptor catching a
 * `verification_required` 403 from a gated write endpoint.
 *
 * `MessageService` is INJECTED FROM THE APP-LEVEL provider (see
 * `app.config.ts`) — there is exactly one `<p-toast>` host mounted by
 * the dashboard shell. A component-level provider here would spawn its
 * own toast host and overlap with the existing one.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    ButtonModule,
    CardModule,
    ConfirmPopup,
    EmailVerificationStatusComponent,
    UserAvatarComponent,
    TranslatePipe,
  ],
  // ConfirmationService is a per-component dependency for the avatar-remove
  // confirm popup; mounting it here avoids leaking the dependency into every
  // route in the dashboard shell. MessageService stays the app-level toast
  // host (see the comment block in the original template / spec).
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  @ViewChild('avatarInput') private avatarInput?: ElementRef<HTMLInputElement>;

  protected readonly user = this.authService.user;
  protected readonly exporting = signal<boolean>(false);
  protected readonly avatarUploading = signal<boolean>(false);
  protected readonly avatarUrl = computed<string | null>(() => this.user()?.avatar_url ?? null);

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
   * payments + attendance). Drives a temporary anchor click — no backend
   * file path is leaked to the URL bar, and the object URL is revoked
   * the moment the click has been dispatched.
   *
   * The `exporting` flag is settled in `finalize()` so it always returns
   * to false on completion, error, or unsubscribe — single source of truth
   * for the loading state, no duplicate logic in success vs error paths.
   */
  exportMyData(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.authService
      .exportMyData('zip')
      .pipe(finalize(() => this.exporting.set(false)))
      .subscribe({
        next: ({ blob, filename }) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
        error: (err: { status?: number }) => {
          const detail = this.translate.instant(
            err.status === 429
              ? 'profile.exportToast.throttledDetail'
              : 'profile.exportToast.genericErrorDetail',
          );
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('profile.exportToast.errorSummary'),
            detail,
          });
        },
      });
  }

  /**
   * Avatar upload (#411). Mirrors the academy-logo flow on
   * `AcademyDetailComponent`: hidden file input + browse button, MIME +
   * size guards before the request, toast on success / failure. The
   * server overwrites the previous file in place (deterministic
   * `users/avatars/{id}.jpg` path), so a replace doesn't need a separate
   * cleanup hop.
   */
  protected onAvatarBrowse(): void {
    this.avatarInput?.nativeElement.click();
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.avatarToast.unsupportedSummary'),
        detail: this.translate.instant('profile.avatarToast.unsupportedDetail'),
        life: 4000,
      });
      input.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.avatarToast.tooLargeSummary'),
        detail: this.translate.instant('profile.avatarToast.tooLargeDetail'),
        life: 4000,
      });
      input.value = '';
      return;
    }

    this.avatarUploading.set(true);
    this.authService.uploadAvatar(file).subscribe({
      next: () => {
        this.avatarUploading.set(false);
        input.value = '';
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.avatarToast.uploadSuccess'),
          life: 2500,
        });
      },
      error: () => {
        this.avatarUploading.set(false);
        input.value = '';
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.avatarToast.uploadErrorSummary'),
          detail: this.translate.instant('profile.avatarToast.uploadErrorDetail'),
          life: 4000,
        });
      },
    });
  }

  /**
   * Confirm-then-remove for the avatar (#411). The destructive-action canon
   * (Krug § "forgiveness for mistakes") demands a confirm step — the user
   * could be one fat-finger away from clearing a head-shot they took five
   * minutes to get right. Same `p-confirmpopup` pattern as the academy-logo
   * remove flow.
   */
  protected confirmRemoveAvatar(event: Event): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: this.translate.instant('profile.avatarConfirm.removeMessage'),
      acceptLabel: this.translate.instant('profile.avatarConfirm.removeAccept'),
      rejectLabel: this.translate.instant('profile.avatarConfirm.removeReject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.removeAvatar(),
    });
  }

  private removeAvatar(): void {
    this.authService.removeAvatar().subscribe({
      next: () =>
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.avatarToast.removeSuccess'),
          life: 2500,
        }),
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.avatarToast.removeErrorSummary'),
          detail: this.translate.instant('profile.avatarToast.removeErrorDetail'),
          life: 4000,
        }),
    });
  }
}
