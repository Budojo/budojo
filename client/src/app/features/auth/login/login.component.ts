import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    TranslatePipe,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /**
   * 2FA gate state (#412). Off by default; flips on when the server
   * returns 422 `two_factor_required`. While on, the form swaps to the
   * code-entry step and `submit()` retries with `two_factor_code`. The
   * email/password fields stay frozen so the user sees what's being
   * authenticated.
   */
  readonly twoFactorRequired = signal(false);
  readonly twoFactorError = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    two_factor_code: [''],
  });

  submit(): void {
    if (!this.twoFactorRequired() && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.twoFactorRequired() && !this.form.controls.two_factor_code.value) {
      this.twoFactorError.set('auth.login.twoFactor.codeRequired');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.twoFactorError.set(null);

    const payload: { email: string; password: string; two_factor_code?: string } = {
      email: this.form.value.email!,
      password: this.form.value.password!,
    };
    if (this.twoFactorRequired()) {
      payload.two_factor_code = this.form.value.two_factor_code ?? '';
    }

    this.auth
      .login(payload)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          // Persona-aware redirect (#445, M7 PR-D). Owner stays on
          // the existing landing; athletes land on the welcome shell
          // (the real athlete dashboard ships in a future PR-E).
          // Default-to-owner keeps backwards compat for cached
          // envelopes from before the role field shipped.
          const role = res?.data?.role ?? 'owner';
          this.router.navigate([role === 'athlete' ? '/athlete-portal/welcome' : '/dashboard']);
        },
        error: (err: HttpErrorResponse) => {
          const serverMessage = err?.error?.message;
          if (err.status === 422 && serverMessage === 'two_factor_required') {
            this.twoFactorRequired.set(true);
            this.form.controls.two_factor_code.setValidators([Validators.required]);
            this.form.controls.two_factor_code.updateValueAndValidity();
            return;
          }
          if (err.status === 422 && serverMessage === 'invalid_two_factor_code') {
            this.twoFactorError.set('auth.login.twoFactor.codeInvalid');
            return;
          }
          this.error.set(serverMessage ?? 'Invalid credentials. Please try again.');
        },
      });
  }

  cancelTwoFactor(): void {
    this.twoFactorRequired.set(false);
    this.twoFactorError.set(null);
    this.form.controls.two_factor_code.reset('');
    this.form.controls.two_factor_code.clearValidators();
    this.form.controls.two_factor_code.updateValueAndValidity();
  }

  get email() {
    return this.form.get('email')!;
  }
  get password() {
    return this.form.get('password')!;
  }
  get twoFactorCode() {
    return this.form.get('two_factor_code')!;
  }
}
