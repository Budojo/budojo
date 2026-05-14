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
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TooltipModule } from 'primeng/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { EmailVerificationStatusComponent } from '../../shared/components/email-verification-status/email-verification-status.component';
import { PasswordStrengthMeterComponent } from '../../shared/components/password-strength-meter/password-strength-meter.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { ProfileBrowserNotificationsComponent } from './browser-notifications/profile-browser-notifications.component';
import { ProfileLoginHistoryComponent } from './login-history/profile-login-history.component';
import { ProfileNotificationsComponent } from './notifications/profile-notifications.component';
import { ProfileSessionsComponent } from './sessions/profile-sessions.component';
import { ProfileTwoFactorComponent } from './two-factor/profile-two-factor.component';
import { ProfileApiTokensComponent } from './api-tokens/profile-api-tokens.component';

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
    ConfirmPopup,
    EmailVerificationStatusComponent,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    PasswordModule,
    PasswordStrengthMeterComponent,
    ProfileBrowserNotificationsComponent,
    ProfileLoginHistoryComponent,
    ProfileNotificationsComponent,
    ProfileSessionsComponent,
    ProfileTwoFactorComponent,
    ProfileApiTokensComponent,
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
   * Reactive form for the inline name edit (#463 + #479). After the
   * #479 split, "name" is two fields: `first_name` + `last_name`. Each
   * carries the same validator stack as the legacy single field
   * (required + non-whitespace-only + min 2 + max 100, mirroring the
   * server's `UpdateProfileRequest`).
   */
  protected readonly nameForm = this.fb.group({
    first_name: [
      '',
      [
        Validators.required,
        nonWhitespaceRequiredValidator(),
        Validators.minLength(2),
        Validators.maxLength(100),
      ],
    ],
    last_name: [
      '',
      [
        Validators.required,
        nonWhitespaceRequiredValidator(),
        Validators.minLength(2),
        Validators.maxLength(100),
      ],
    ],
  });

  /** True while PATCH /me is in flight for the handle edit (#479). */
  protected readonly savingHandle = signal<boolean>(false);

  /** True when the user has clicked the inline pencil to edit their handle (#479). */
  protected readonly editingHandle = signal<boolean>(false);

  /**
   * Server-mapped error for the handle-edit row (#479). Three branches:
   * `invalid` (422 `handle_invalid_format` — IG-style format violation),
   * `taken` (422 `handle_taken` — already a different user's), `generic`
   * (5xx / network / unknown). Cleared on every fresh submit attempt.
   */
  protected readonly handleServerError = signal<'invalid' | 'taken' | 'generic' | null>(null);

  /**
   * Reactive form for the inline handle edit (#479). Constraints mirror
   * the server's `HandleFormat` rule: 3-30 chars, lowercase `[a-z0-9_.]`,
   * must start with a letter, no consecutive dots, no leading/trailing
   * dot. Empty string clears the handle (sent to the server as `null`).
   */
  protected readonly handleForm = this.fb.group({
    handle: [
      '',
      [
        // Empty is allowed — clearing the handle is a valid action.
        // The submit path translates `''` to `null` on the wire.
        Validators.maxLength(30),
        handleFormatValidator(),
      ],
    ],
  });

  /** True while POST /me/email-change is in flight (#476). */
  protected readonly requestingEmail = signal<boolean>(false);

  /** True while DELETE /me/email-change is in flight (#476). */
  protected readonly cancellingEmail = signal<boolean>(false);

  /** True when the user has clicked the inline pencil to change their email (#476). */
  protected readonly editingEmail = signal<boolean>(false);

  /**
   * Server-mapped error for the email-change row (#476). Five named
   * branches cover the wire shapes the server emits:
   *
   * - `invalid` — 422 `errors.email` with no recognized code
   * - `taken` — 422 `email_taken` (already a different user's email)
   * - `unchanged` — 422 `email_unchanged` (same as current)
   * - `throttled` — 429 (too many requests within the hourly window)
   * - `generic` — 5xx / network / unknown
   *
   * Cleared on every fresh submit attempt before the validity guard
   * so a stale 422 doesn't linger while the user fixes a client-side
   * error (mirrors the change-password pattern below).
   */
  protected readonly emailServerError = signal<
    'invalid' | 'taken' | 'unchanged' | 'throttled' | 'generic' | null
  >(null);

  /**
   * Reactive form for the inline email edit (#476). The validators
   * mirror the server's `RequestEmailChangeRequest`: `required` +
   * `email` + `max:255`. Error rendering follows the same priority
   * chain as the name edit (touched-and-invalid client validators
   * first, then a server-mapped error).
   */
  protected readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
  });

  /** Pending email-change block from the cached user, when any. */
  protected readonly pendingEmailChange = computed(() => this.user()?.pending_email_change ?? null);

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
  protected readonly changePasswordServerError = signal<
    'current' | 'breached' | 'password' | 'generic' | null
  >(null);

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
   * Open the inline email-edit row (#476). The form is pre-cleared
   * rather than pre-filled — typing a fresh address from scratch is
   * the user's whole intent here, unlike the name edit where the
   * current value is the obvious starting point.
   */
  startEditEmail(): void {
    this.emailForm.reset({ email: '' });
    this.emailServerError.set(null);
    this.editingEmail.set(true);
  }

  /** Drop the in-progress email edit; the cached user.email stays unchanged. */
  cancelEditEmail(): void {
    this.editingEmail.set(false);
    this.emailServerError.set(null);
  }

  /**
   * Submit the email change request (#476). On success the SPA does
   * NOT mutate the cached user signal — the live email won't change
   * until the verification link is clicked. We refetch via
   * `loadCurrentUser()` so the `pending_email_change` block on the
   * envelope hydrates the pillola immediately. Then we toast.
   *
   * Confirm-popup pattern (Krug § "forgiveness for mistakes"): the
   * dialog spells out "we'll send a link to {newEmail}; until you
   * click it your login email stays {currentEmail}". This is the
   * critical-action moment — getting the new address right matters
   * because a typo locks the legitimate inbox out of the new address
   * round-trip.
   */
  submitEditEmail(event: Event): void {
    if (this.requestingEmail()) return;

    this.emailServerError.set(null);

    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const newEmail = (this.emailForm.getRawValue().email ?? '').trim();
    const currentEmail = this.user()?.email ?? '';

    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      header: this.translate.instant('account.emailChange.profile.confirmTitle'),
      message: this.translate.instant('account.emailChange.profile.confirmMessage', {
        newEmail,
        currentEmail,
      }),
      acceptLabel: this.translate.instant('account.emailChange.profile.confirmAccept'),
      rejectLabel: this.translate.instant('account.emailChange.profile.confirmReject'),
      accept: () => this.dispatchEmailRequest(newEmail),
    });
  }

  private dispatchEmailRequest(newEmail: string): void {
    this.requestingEmail.set(true);
    this.authService
      .requestEmailChange(newEmail)
      .pipe(finalize(() => this.requestingEmail.set(false)))
      .subscribe({
        next: () => {
          this.editingEmail.set(false);
          // Refresh the cached user so the pending pillola lights up
          // in this tab without the user having to refresh.
          this.authService.loadCurrentUser().subscribe({ error: () => undefined });
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('account.emailChange.toast.linkSentSummary'),
            detail: this.translate.instant('account.emailChange.toast.linkSentDetail', {
              newEmail,
            }),
            life: 4000,
          });
        },
        error: (err: { status?: number; error?: { errors?: Record<string, unknown> } }) => {
          const errors = err.error?.errors ?? {};
          if (err.status === 429) {
            this.emailServerError.set('throttled');
            return;
          }
          // Laravel keys validation errors by FIELD; the message
          // string ("email_taken" / "email_unchanged") sits in the
          // values array.
          const emailErrors = errors['email'];
          const code =
            Array.isArray(emailErrors) && typeof emailErrors[0] === 'string'
              ? emailErrors[0]
              : null;
          if (code === 'email_taken') {
            this.emailServerError.set('taken');
          } else if (code === 'email_unchanged') {
            this.emailServerError.set('unchanged');
          } else if ('email' in errors) {
            this.emailServerError.set('invalid');
          } else {
            this.emailServerError.set('generic');
          }
        },
      });
  }

  /**
   * Cancel an outstanding email-change pending row (#476). Server-side
   * is idempotent (a no-op when no row exists), so we don't gate on
   * `pendingEmailChange()` being non-null — defensive against a stale
   * cached user signal. Toast on success; the auth service refreshes
   * the cached user afterwards so the pillola disappears in the same
   * tick.
   */
  cancelPendingEmailChange(): void {
    if (this.cancellingEmail()) return;
    this.cancellingEmail.set(true);
    this.authService
      .cancelPendingEmailChange()
      .pipe(finalize(() => this.cancellingEmail.set(false)))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('account.emailChange.toast.cancelledSummary'),
            life: 2500,
          });
        },
        error: () => undefined,
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
        error: (err: { status?: number; error?: { errors?: Record<string, string[]> } }) => {
          const errors = err.error?.errors ?? {};
          const passwordErrs = errors['password'] ?? [];
          if ('current_password' in errors) {
            this.changePasswordServerError.set('current');
          } else if (passwordErrs.includes('password_breached')) {
            // HIBP breach hit (#415) — distinct from a generic
            // `password` 422 so the SPA shows the actionable copy
            // ("This password has appeared in known data breaches…").
            this.changePasswordServerError.set('breached');
          } else if ('password' in errors) {
            this.changePasswordServerError.set('password');
          } else {
            this.changePasswordServerError.set('generic');
          }
        },
      });
  }

  /**
   * Open the inline name-edit form (#463 + #479). Pre-fills both
   * controls with the cached values so the user starts from the
   * current state rather than empty inputs.
   */
  startEditName(): void {
    const u = this.user();
    this.nameForm.reset({
      first_name: u?.first_name ?? '',
      last_name: u?.last_name ?? '',
    });
    this.nameServerError.set(null);
    this.editingName.set(true);
  }

  /** Drop the in-progress edit; the cached user names stay untouched. */
  cancelEditName(): void {
    this.editingName.set(false);
    this.nameServerError.set(null);
  }

  /**
   * Submit the name change (#463 + #479). Sends first_name + last_name +
   * the current handle (so the no-op handle-on-name-edit doesn't
   * accidentally clear it server-side via the absence of the field).
   */
  submitEditName(): void {
    if (this.savingName()) return;

    this.nameServerError.set(null);

    if (this.nameForm.invalid) {
      this.nameForm.markAllAsTouched();
      return;
    }

    const raw = this.nameForm.getRawValue();
    const firstName = (raw.first_name ?? '').trim();
    const lastName = (raw.last_name ?? '').trim();
    const u = this.user();
    // No-op short-circuit: if neither first nor last changed, treat it
    // like a cancel — no round-trip, no toast.
    if (firstName === (u?.first_name ?? '') && lastName === (u?.last_name ?? '')) {
      this.editingName.set(false);
      return;
    }

    this.savingName.set(true);

    this.authService
      .updateProfile({
        first_name: firstName,
        last_name: lastName,
        handle: u?.handle ?? null,
      })
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
          this.nameServerError.set(
            'first_name' in errors || 'last_name' in errors ? 'invalid' : 'generic',
          );
        },
      });
  }

  protected get firstNameControl(): AbstractControl {
    return this.nameForm.get('first_name')!;
  }

  protected get lastNameControl(): AbstractControl {
    return this.nameForm.get('last_name')!;
  }

  protected get handleControl(): AbstractControl {
    return this.handleForm.get('handle')!;
  }

  /**
   * Open the inline handle-edit form (#479). Pre-fills with the cached
   * handle (or empty string if the user hasn't set one yet).
   */
  startEditHandle(): void {
    const current = this.user()?.handle ?? '';
    this.handleForm.reset({ handle: current });
    this.handleServerError.set(null);
    this.editingHandle.set(true);
  }

  /** Drop the in-progress handle edit; the cached value stays untouched. */
  cancelEditHandle(): void {
    this.editingHandle.set(false);
    this.handleServerError.set(null);
  }

  /**
   * Submit the handle change (#479). Empty input clears the handle
   * (server-side `null`); a valid IG-style string sets it. We
   * lowercase on submit (defensive — the `HandleFormat` validator
   * rejects mixed-case input client-side already, so a mixed-case
   * value can only land here from a programmatic patchValue / a stale
   * paste before the validator runs). The server lowercases again on
   * save as a final backstop for non-HTTP callers.
   */
  submitEditHandle(): void {
    if (this.savingHandle()) return;

    this.handleServerError.set(null);

    if (this.handleForm.invalid) {
      this.handleForm.markAllAsTouched();
      return;
    }

    const raw = (this.handleForm.getRawValue().handle ?? '').trim();
    const newHandle = raw === '' ? null : raw.toLowerCase();
    const u = this.user();
    // No-op short-circuit: same value as cached → treat like cancel.
    if (newHandle === (u?.handle ?? null)) {
      this.editingHandle.set(false);
      return;
    }

    this.savingHandle.set(true);

    this.authService
      .updateProfile({
        first_name: u?.first_name ?? '',
        last_name: u?.last_name ?? '',
        handle: newHandle,
      })
      .pipe(finalize(() => this.savingHandle.set(false)))
      .subscribe({
        next: () => {
          this.editingHandle.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('profile.editHandle.successSummary'),
            life: 2500,
          });
        },
        error: (err: { error?: { errors?: Record<string, string[]> } }) => {
          const handleErrs = err.error?.errors?.['handle'] ?? [];
          if (handleErrs.includes('handle_taken')) {
            this.handleServerError.set('taken');
          } else if (handleErrs.includes('handle_invalid_format')) {
            this.handleServerError.set('invalid');
          } else if (handleErrs.length > 0) {
            this.handleServerError.set('invalid');
          } else {
            this.handleServerError.set('generic');
          }
        },
      });
  }

  /**
   * Single source of truth for the inline name-edit error row (#463).
   * Picks the highest-priority message — touched-and-invalid client
   * validators first, then a server-mapped error — so the template can
   * render exactly one `<small id="profileNameError">` element. Avoids
   * the duplicate-id + ambiguous-aria-describedby a11y trap that
   * surfaces when each branch ships its own `<small>` with the same id.
   */
  protected get firstNameError(): { dataCy: string; key: string } | null {
    if (this.firstNameControl.touched) {
      if (this.firstNameControl.errors?.['required']) {
        return { dataCy: 'profile-first-name-required', key: 'profile.editName.firstNameRequired' };
      }
      if (this.firstNameControl.errors?.['minlength']) {
        return {
          dataCy: 'profile-first-name-minlength',
          key: 'profile.editName.firstNameMinLength',
        };
      }
      if (this.firstNameControl.errors?.['maxlength']) {
        return {
          dataCy: 'profile-first-name-maxlength',
          key: 'profile.editName.firstNameMaxLength',
        };
      }
    }
    return null;
  }

  protected get lastNameError(): { dataCy: string; key: string } | null {
    if (this.lastNameControl.touched) {
      if (this.lastNameControl.errors?.['required']) {
        return { dataCy: 'profile-last-name-required', key: 'profile.editName.lastNameRequired' };
      }
      if (this.lastNameControl.errors?.['minlength']) {
        return { dataCy: 'profile-last-name-minlength', key: 'profile.editName.lastNameMinLength' };
      }
      if (this.lastNameControl.errors?.['maxlength']) {
        return { dataCy: 'profile-last-name-maxlength', key: 'profile.editName.lastNameMaxLength' };
      }
    }
    return null;
  }

  /**
   * Server-mapped error row that's shared by both name fields (the
   * server returns `errors.first_name` or `errors.last_name` and we
   * collapse to one banner above the form because the user already
   * sees per-field validity from the local validators).
   */
  protected get nameServerErrorRow(): { dataCy: string; key: string } | null {
    const server = this.nameServerError();
    if (server === 'invalid') {
      return { dataCy: 'profile-name-server-invalid', key: 'profile.editName.serverInvalid' };
    }
    if (server === 'generic') {
      return { dataCy: 'profile-name-server-generic', key: 'profile.editName.serverGeneric' };
    }
    return null;
  }

  /**
   * Single source of truth for the inline handle-edit error row (#479).
   * Picks the highest-priority message: client format violation first,
   * then server-mapped errors (taken / invalid / generic).
   */
  protected get handleError(): { dataCy: string; key: string } | null {
    if (this.handleControl.touched) {
      if (this.handleControl.errors?.['handleInvalidFormat']) {
        return { dataCy: 'profile-handle-format', key: 'profile.editHandle.invalidFormat' };
      }
      if (this.handleControl.errors?.['maxlength']) {
        return { dataCy: 'profile-handle-maxlength', key: 'profile.editHandle.invalidFormat' };
      }
    }
    const server = this.handleServerError();
    if (server === 'taken') {
      return { dataCy: 'profile-handle-taken', key: 'profile.editHandle.taken' };
    }
    if (server === 'invalid') {
      return { dataCy: 'profile-handle-server-invalid', key: 'profile.editHandle.invalidFormat' };
    }
    if (server === 'generic') {
      return { dataCy: 'profile-handle-server-generic', key: 'profile.editHandle.serverGeneric' };
    }
    return null;
  }

  /** Form control accessor for the inline email-edit row (#476). */
  protected get emailControl(): AbstractControl {
    return this.emailForm.get('email')!;
  }

  /**
   * Single source of truth for the inline email-edit error row (#476).
   * Mirrors the `nameError` getter pattern: touched-and-invalid client
   * validators first, then a server-mapped error.
   */
  protected get emailError(): { dataCy: string; key: string } | null {
    if (this.emailControl.touched) {
      if (this.emailControl.errors?.['required']) {
        return { dataCy: 'profile-email-required', key: 'account.emailChange.profile.required' };
      }
      if (this.emailControl.errors?.['email']) {
        return { dataCy: 'profile-email-invalid', key: 'account.emailChange.profile.invalid' };
      }
      if (this.emailControl.errors?.['maxlength']) {
        return { dataCy: 'profile-email-maxlength', key: 'account.emailChange.profile.maxLength' };
      }
    }
    const server = this.emailServerError();
    if (server === 'taken') {
      return {
        dataCy: 'profile-email-server-taken',
        key: 'account.emailChange.profile.serverEmailTaken',
      };
    }
    if (server === 'unchanged') {
      return {
        dataCy: 'profile-email-server-unchanged',
        key: 'account.emailChange.profile.serverEmailUnchanged',
      };
    }
    if (server === 'throttled') {
      return {
        dataCy: 'profile-email-server-throttled',
        key: 'account.emailChange.profile.serverThrottled',
      };
    }
    if (server === 'invalid') {
      return {
        dataCy: 'profile-email-server-invalid',
        key: 'account.emailChange.profile.serverInvalid',
      };
    }
    if (server === 'generic') {
      return {
        dataCy: 'profile-email-server-generic',
        key: 'account.emailChange.profile.serverGeneric',
      };
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

/**
 * Instagram-style handle validator (#479). Mirrors the server's
 * `App\Rules\HandleFormat` rule verbatim so the SPA preview matches
 * what the server will accept:
 *
 * - 3-30 chars
 * - lowercase `[a-z0-9_.]` charset
 * - must start with a letter
 * - no consecutive dots
 * - no leading/trailing dot
 *
 * Empty string is ALLOWED (clearing the handle is a valid action; the
 * submit handler translates `''` to `null` on the wire). Returns
 * `{ handleInvalidFormat: true }` on failure so the template can
 * surface the IG-style helper text.
 */
function handleFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value === '') return null;

    if (value.length < 3 || value.length > 30) return { handleInvalidFormat: true };
    if (!/^[a-z][a-z0-9._]{2,29}$/.test(value)) return { handleInvalidFormat: true };
    if (value.includes('..')) return { handleInvalidFormat: true };
    if (value.endsWith('.')) return { handleInvalidFormat: true };

    return null;
  };
}
