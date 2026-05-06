import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
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
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TooltipModule } from 'primeng/tooltip';
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
    InputTextModule,
    PasswordModule,
    ReactiveFormsModule,
    TooltipModule,
    TranslatePipe,
    UserAvatarComponent,
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
  private readonly fb = inject(FormBuilder);

  @ViewChild('avatarInput') private avatarInput?: ElementRef<HTMLInputElement>;

  protected readonly user = this.authService.user;
  protected readonly exporting = signal<boolean>(false);
  protected readonly avatarUploading = signal<boolean>(false);
  protected readonly avatarUrl = computed<string | null>(() => this.user()?.avatar_url ?? null);

  /** True while PATCH /me is in flight (#463). */
  protected readonly savingName = signal<boolean>(false);

  /** True when the user has clicked the inline pencil to edit their name (#463). */
  protected readonly editingName = signal<boolean>(false);

  /**
   * Server-mapped error for the name-edit row (#463). `invalid` flips on a
   * 422 with `errors.name` (server's `min:2` / `max:255` boundary, in case
   * the SPA's matching validators ever drift); `generic` covers everything
   * else (5xx / network). Cleared on every fresh submit attempt.
   */
  protected readonly nameServerError = signal<'invalid' | 'generic' | null>(null);

  /**
   * Reactive form for the inline name edit (#463). Constraints mirror the
   * server's `UpdateProfileRequest`: `required | min:2 | max:255`. The
   * `nonWhitespaceRequired` validator catches the whitespace-only case
   * the raw `Validators.required` blind-spots (`"   "` passes the raw
   * required check) — without it `submitEditName()` would trim to `""`
   * and the user would see a server 422 instead of the inline error
   * (#471). Scoped so short non-whitespace input (`"X"`) still falls
   * through to `Validators.minLength` — otherwise both errors compete
   * and the getter priority chain shows the wrong copy.
   */
  protected readonly nameForm = this.fb.group({
    name: [
      '',
      [
        Validators.required,
        nonWhitespaceRequiredValidator(),
        Validators.minLength(2),
        Validators.maxLength(255),
      ],
    ],
  });

  /** True while POST /me/password is in flight. */
  protected readonly changingPassword = signal<boolean>(false);

  /**
   * Server-mapped error for the change-password form. `current` flips on
   * a 422 with `errors.current_password` (wrong re-auth) so we can
   * render an inline error under the current-password field. `password`
   * flips on a 422 with `errors.password` (covers same-as-old, weak,
   * mismatched confirmation in the rare case the SPA's own validators
   * miss it). Cleared on every new submit attempt.
   */
  protected readonly changePasswordServerError = signal<'current' | 'password' | 'generic' | null>(
    null,
  );

  /**
   * Reactive form for the change-password sub-section (#409). Three
   * fields; the cross-field validator `passwordsMatchValidator` mirrors
   * the reset-password page so the SPA UX stays consistent.
   */
  protected readonly changePasswordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      newPasswordConfirmation: ['', Validators.required],
    },
    { validators: passwordsMatchValidator() },
  );

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
   * server stores the original bytes (no GD resize); the SPA renders
   * inside a circular CSS frame, with a `?v=updated_at` cache-buster on
   * the URL so a same-extension replace forces the browser to refetch.
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

  /**
   * In-app password change (#409). Submits the form to `POST
   * /api/v1/me/password`; on success the SPA stays logged in (the server
   * preserves the current Sanctum token while revoking every other token
   * on the user). Wrong current password / same-as-old / weak / mismatched
   * are surfaced inline rather than as a toast — the user is staring at
   * the form, an inline error reads naturally; toasts are reserved for
   * the success path so the user knows the operation completed without
   * having to inspect a now-empty form.
   */
  submitChangePassword(): void {
    if (this.changingPassword()) return;

    // Always clear the server-error banner on a fresh submit attempt —
    // BEFORE the form-validity guard. Otherwise a previous 422 (e.g.
    // wrong current password) lingers visibly while the user fixes a
    // client-side error like an empty new-password field, mixing the
    // two error sources in the same render and confusing the user.
    this.changePasswordServerError.set(null);

    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);

    const { currentPassword, newPassword, newPasswordConfirmation } =
      this.changePasswordForm.getRawValue();

    this.authService
      .changePassword({
        current_password: currentPassword ?? '',
        password: newPassword ?? '',
        password_confirmation: newPasswordConfirmation ?? '',
      })
      .pipe(finalize(() => this.changingPassword.set(false)))
      .subscribe({
        next: () => {
          this.changePasswordForm.reset();
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('profile.changePassword.successSummary'),
            detail: this.translate.instant('profile.changePassword.successDetail'),
          });
        },
        error: (err: { status?: number; error?: { errors?: Record<string, unknown> } }) => {
          const errors = err.error?.errors ?? {};
          if ('current_password' in errors) {
            this.changePasswordServerError.set('current');
          } else if ('password' in errors) {
            this.changePasswordServerError.set('password');
          } else {
            this.changePasswordServerError.set('generic');
          }
        },
      });
  }

  /**
   * Open the inline name-edit form (#463). Pre-fills with the cached
   * user.name so the user starts from the current value rather than an
   * empty input — Krug § "self-evident UI" (the user sees what's there
   * and edits in place, the destination is the edit, not "type your
   * whole name from scratch").
   */
  startEditName(): void {
    const current = this.user()?.name ?? '';
    this.nameForm.reset({ name: current });
    this.nameServerError.set(null);
    this.editingName.set(true);
  }

  /** Drop the in-progress edit; the cached user.name stays untouched. */
  cancelEditName(): void {
    this.editingName.set(false);
    this.nameServerError.set(null);
  }

  /**
   * Submit the name change (#463). On success we close the edit row +
   * toast; the cached `user` signal is updated inside `AuthService.
   * updateProfile` so the static value re-renders without an extra
   * round-trip. Inline error on 422 (Norman § feedback — the user is
   * staring at the form, the toast is the wrong channel for a validation
   * issue).
   */
  submitEditName(): void {
    if (this.savingName()) return;

    this.nameServerError.set(null);

    if (this.nameForm.invalid) {
      this.nameForm.markAllAsTouched();
      return;
    }

    const name = (this.nameForm.getRawValue().name ?? '').trim();
    // No-op short-circuit: if the user opened the edit, didn't change
    // anything, and clicked save, we'd otherwise round-trip to the
    // server for nothing. Treat it like a cancel.
    if (name === (this.user()?.name ?? '')) {
      this.editingName.set(false);
      return;
    }

    this.savingName.set(true);

    this.authService
      .updateProfile(name)
      .pipe(finalize(() => this.savingName.set(false)))
      .subscribe({
        next: () => {
          this.editingName.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('profile.editName.successSummary'),
            life: 2500,
          });
        },
        error: (err: { error?: { errors?: Record<string, unknown> } }) => {
          const errors = err.error?.errors ?? {};
          this.nameServerError.set('name' in errors ? 'invalid' : 'generic');
        },
      });
  }

  protected get nameControl(): AbstractControl {
    return this.nameForm.get('name')!;
  }

  /**
   * Single source of truth for the inline name-edit error row (#463).
   * Picks the highest-priority message — touched-and-invalid client
   * validators first, then a server-mapped error — so the template can
   * render exactly one `<small id="profileNameError">` element. Avoids
   * the duplicate-id + ambiguous-aria-describedby a11y trap that
   * surfaces when each branch ships its own `<small>` with the same id.
   */
  protected get nameError(): { dataCy: string; key: string } | null {
    if (this.nameControl.touched) {
      if (this.nameControl.errors?.['required']) {
        return { dataCy: 'profile-name-required', key: 'profile.editName.required' };
      }
      if (this.nameControl.errors?.['minlength']) {
        return { dataCy: 'profile-name-minlength', key: 'profile.editName.minLength' };
      }
      if (this.nameControl.errors?.['maxlength']) {
        return { dataCy: 'profile-name-maxlength', key: 'profile.editName.maxLength' };
      }
    }
    const server = this.nameServerError();
    if (server === 'invalid') {
      return { dataCy: 'profile-name-server-invalid', key: 'profile.editName.serverInvalid' };
    }
    if (server === 'generic') {
      return { dataCy: 'profile-name-server-generic', key: 'profile.editName.serverGeneric' };
    }
    return null;
  }

  protected get currentPassword(): AbstractControl {
    return this.changePasswordForm.get('currentPassword')!;
  }

  protected get newPassword(): AbstractControl {
    return this.changePasswordForm.get('newPassword')!;
  }

  protected get newPasswordConfirmation(): AbstractControl {
    return this.changePasswordForm.get('newPasswordConfirmation')!;
  }
}

/**
 * Cross-field validator: newPasswordConfirmation must match newPassword.
 * Same shape as the reset-password page's validator; the error key
 * `passwordsMismatch` is read off the FORM, not the confirmation
 * control, so the template can render the message without coupling
 * the confirmation control's `errors` to the other field's value.
 */
function passwordsMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const pw = group.get('newPassword')?.value;
    const conf = group.get('newPasswordConfirmation')?.value;
    if (pw && conf && pw !== conf) {
      return { passwordsMismatch: true };
    }
    return null;
  };
}

/**
 * Validator that flags **whitespace-only** input as `{ required:
 * true }`. Specifically scoped to the empty-after-trim case so that
 * short non-whitespace input like `"X"` falls through to the raw
 * `Validators.minLength` (which surfaces as `{ minlength: ... }`) —
 * otherwise both errors fire on the same control and the getter
 * priority chain would show the "Enter your name" copy for `"X"`
 * instead of the more informative "Use at least 2 characters" copy.
 *
 * Raw `Validators.required` only checks `value === '' | null | undefined`
 * — it accepts any whitespace string. Trim-then-check fixes that
 * blind spot without competing with the existing minLength rule.
 */
function nonWhitespaceRequiredValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'string') return null;
    return value.length > 0 && value.trim().length === 0 ? { required: true } : null;
  };
}
