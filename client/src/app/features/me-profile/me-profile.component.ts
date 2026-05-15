import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../core/services/auth.service';

/**
 * Athlete-side profile page (#610, M7 PR-D slice 1 + slice 6 edit).
 *
 * V1 surface: read-only view of first_name, last_name, handle (with
 * a "no username set yet" fallback when null), and email +
 * verified/unverified badge.
 *
 * Slice 6 adds an inline edit mode wrapping all three name fields
 * (first_name, last_name, handle). The PATCH /me endpoint already
 * lived for owners; this surface routes through the same
 * `AuthService.updateProfile()` method so the cached user envelope
 * (and the avatar initials downstream) refresh on save.
 *
 * Email change is intentionally NOT in this form — it has its own
 * dedicated verify-by-token flow at `/me/email-change` (#476).
 */
const noConsecutiveDots: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.includes('..')
    ? { handleConsecutiveDots: true }
    : null;

const noTrailingDot: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.endsWith('.')
    ? { handleTrailingDot: true }
    : null;

@Component({
  selector: 'app-me-profile',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, ButtonModule, InputTextModule, ToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  templateUrl: './me-profile.component.html',
  styleUrl: './me-profile.component.scss',
})
export class MeProfileComponent {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  protected readonly user = this.authService.user;
  protected readonly editing = signal(false);
  protected readonly submitting = signal(false);

  /**
   * Form validators mirror the server's `UpdateProfileRequest` rules
   * (Copilot review on PR #626):
   *
   * - first_name / last_name: required, min 2, max 100 chars (per
   *   `'min:2', 'max:100'` server-side).
   * - handle: optional (empty string → null server-side). When set,
   *   matches the server's `HandleFormat` rule — first char [a-z],
   *   remaining 2-29 chars [a-z0-9._], total 3-30 chars, no
   *   consecutive dots, no leading / trailing dot. The pattern is
   *   the canonical server regex with the consecutive-dot guard
   *   added as a second regex (lookahead is hard to read).
   */
  protected readonly form = this.fb.nonNullable.group({
    first_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    handle: [
      '',
      [Validators.pattern(/^$|^[a-z][a-z0-9._]{2,29}$/), noConsecutiveDots, noTrailingDot],
    ],
  });

  constructor() {
    // Auto-lowercase the handle as the user types so the pattern
    // validator (which requires `^[a-z]…`) doesn't silently reject
    // capital-first input like "Eli". Real-user feedback on prod
    // 2026-05-15 — see #756. `emitEvent: false` keeps the re-emission
    // from re-entering this subscription.
    this.form.controls.handle.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (typeof value === 'string' && value !== value.toLowerCase()) {
          this.form.controls.handle.setValue(value.toLowerCase(), { emitEvent: false });
        }
      });
  }

  protected startEdit(): void {
    const current = this.user();
    if (current === null) return;
    this.form.reset({
      first_name: current.first_name ?? '',
      last_name: current.last_name ?? '',
      handle: current.handle ?? '',
    });
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const handle = raw.handle.trim();

    this.authService
      .updateProfile({
        first_name: raw.first_name.trim(),
        last_name: raw.last_name.trim(),
        handle: handle === '' ? null : handle.toLowerCase(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.editing.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.translateService.instant('athletePortal.profile.editSavedToast'),
            life: 3000,
          });
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          // 422 on handle taken / pattern fail — surface a toast and
          // leave the form open so the user can correct + retry.
          const summary = this.isHandleTaken(err)
            ? this.translateService.instant('athletePortal.profile.editHandleTakenToast')
            : this.translateService.instant('athletePortal.profile.editErrorToast');
          this.messageService.add({ severity: 'error', summary, life: 4000 });
        },
      });
  }

  /**
   * Whether the 422 response specifically signals `handle_taken`
   * (the dedicated UNIQUE-constraint code from the server's
   * UpdateProfileRequest messages map). The previous shape returned
   * `true` for ANY error under `errors.handle`, which incorrectly
   * surfaced the "username is already taken" toast on a
   * `handle_invalid_format` failure (Copilot review on PR #626).
   */
  private isHandleTaken(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const status = (err as { status?: unknown }).status;
    if (status !== 422) return false;
    const errorBody = (err as { error?: { errors?: Record<string, unknown> } }).error;
    const handleErrors = errorBody?.errors?.['handle'];
    if (!Array.isArray(handleErrors) || handleErrors.length === 0) return false;
    return handleErrors[0] === 'handle_taken';
  }
}
