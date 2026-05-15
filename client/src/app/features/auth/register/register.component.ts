import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationOnboardingService } from '../../../core/services/notification-onboarding.service';
import { PasswordStrengthMeterComponent } from '../../../shared/components/password-strength-meter/password-strength-meter.component';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    PasswordStrengthMeterComponent,
    TranslatePipe,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationOnboarding = inject(NotificationOnboardingService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /**
   * Server-mapped error for the password field (#415). `breached` flips
   * on a 422 with `errors.password: ['password_breached']` so the SPA
   * renders the dedicated copy ("This password has appeared in known
   * data breaches…") next to the field — Norman § feedback. Cleared on
   * every fresh submit attempt before the validity guard.
   */
  readonly passwordServerError = signal<'breached' | null>(null);

  readonly form = this.fb.group(
    {
      first_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      last_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirmation: ['', Validators.required],
      // GDPR Art. 13 acceptance gate (#219). The checkbox is required
      // — Validators.requiredTrue rejects `false` AND `null`, which is
      // exactly what we want here: a user must actively click "I have
      // read..." for the form to submit. We don't send the value to
      // the API; the implicit consent record is the timestamp of the
      // successful POST /auth/register itself.
      privacy_accepted: [false, Validators.requiredTrue],
      // Terms-of-Service acceptance gate (#420). Mirrors the privacy
      // gate above — same `requiredTrue` semantics — but unlike privacy
      // the value IS sent to the API: the server uses it to stamp the
      // durable `users.terms_accepted_at` timestamp on the row. The
      // server's `RegisterRequest` enforces the `accepted` rule
      // independently, so a malicious client that strips the field
      // still hits a 422.
      terms_accepted: [false, Validators.requiredTrue],
    },
    { validators: this.passwordsMatch },
  );

  private passwordsMatch(g: import('@angular/forms').AbstractControl) {
    const pw = g.get('password')?.value;
    const confirm = g.get('password_confirmation')?.value;
    return pw === confirm ? null : { mismatch: true };
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.passwordServerError.set(null);

    this.auth
      .register({
        first_name: this.form.value.first_name!,
        last_name: this.form.value.last_name!,
        email: this.form.value.email!,
        password: this.form.value.password!,
        password_confirmation: this.form.value.password_confirmation!,
        // Pinned to true: Validators.requiredTrue blocks submit while
        // the form is invalid, so reaching this branch implies the box
        // is ticked. We pass the literal rather than `this.form.value
        // .terms_accepted!` so the server sees a strict boolean rather
        // than the form's possibly-truthy-but-non-boolean value.
        terms_accepted: true,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          // #745 — fire the post-registration soft prompt before
          // navigating so the dialog mounts at the app root while the
          // dashboard shell hydrates underneath. Skip conditions live
          // inside the service (already decided, permission != default,
          // unsupported browser).
          this.notificationOnboarding.requestPromptAfterAuth();
          void this.router.navigate(['/dashboard']);
        },
        error: (err: {
          status?: number;
          error?: { message?: string; errors?: Record<string, string[]> };
        }) => {
          // Map `password_breached` (#415) to the inline server-error
          // signal. Other 422s fall through to the generic banner.
          const passwordErrs = err?.error?.errors?.['password'] ?? [];
          if (passwordErrs.includes('password_breached')) {
            this.passwordServerError.set('breached');
            return;
          }
          this.error.set(err?.error?.message ?? 'Something went wrong. Please try again.');
        },
      });
  }

  get firstName() {
    return this.form.get('first_name')!;
  }
  get lastName() {
    return this.form.get('last_name')!;
  }
  get email() {
    return this.form.get('email')!;
  }
  get password() {
    return this.form.get('password')!;
  }
  get passwordConfirmation() {
    return this.form.get('password_confirmation')!;
  }
  get privacyAccepted() {
    return this.form.get('privacy_accepted')!;
  }
  get termsAccepted() {
    return this.form.get('terms_accepted')!;
  }
}
