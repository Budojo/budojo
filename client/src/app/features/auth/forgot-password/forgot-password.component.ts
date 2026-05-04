import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

/**
 * `/auth/forgot-password` (M5 PR-A). Single email field; on submit calls
 * `POST /api/v1/auth/forgot-password` and shows the same "if your address
 * is registered we sent you a link" message regardless of whether the
 * email is in our DB. The server contract is identical for known and
 * unknown addresses, so the SPA must not reveal the difference either.
 *
 * The form stays usable after a successful submission so a user who
 * mistyped their email can correct + resubmit. Server throttles 6
 * requests / minute / IP.
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.auth
      .forgotPassword({ email: this.form.value.email ?? '' })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.submitted.set(true),
        error: (err: { status?: number }) => {
          // The only failure surface that matters to the user is the
          // 429 throttle: the server returned 6 success responses
          // already, so we render the same "check your inbox"
          // optimistic state and ask them to wait before retrying.
          // Any other transport error gets a generic message.
          if (err.status === 429) {
            this.submitted.set(true);
          } else {
            this.error.set('auth.forgotPassword.errorGeneric');
          }
        },
      });
  }

  get email() {
    return this.form.get('email')!;
  }
}
