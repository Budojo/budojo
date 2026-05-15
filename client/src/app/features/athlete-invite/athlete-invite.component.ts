import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import {
  AthleteInvitePreview,
  AthleteInviteService,
} from '../../core/services/athlete-invite.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationOnboardingService } from '../../core/services/notification-onboarding.service';

/**
 * Public athlete-invite landing page (#445, M7 PR-C). Reached at
 * `/athlete-invite/:token` from the email link the owner sends. The
 * page lives outside the dashboard shell because:
 *
 * 1. The user is not yet authenticated (the token IS the auth, not a
 *    bearer in localStorage); the dashboard guards would bounce them.
 * 2. The shell would render a sidebar geared at owners; the athlete
 *    onboarding moment wants a focused, single-task page instead.
 *
 * The component has three render states: loading, error (404 from
 * preview = unknown / revoked / accepted / expired token), and form
 * (pending preview hydrated). On submit it consumes the token, drops
 * the returned Sanctum token into the SPA's auth state via
 * `AuthService::adoptIssuedToken`, and routes to /dashboard — same
 * landing the SPA's auth flow uses elsewhere.
 */
type State = 'loading' | 'invalid' | 'ready' | 'submitting' | 'error';

@Component({
  selector: 'app-athlete-invite',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    TranslatePipe,
  ],
  templateUrl: './athlete-invite.component.html',
  styleUrl: './athlete-invite.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteInviteComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly inviteService = inject(AthleteInviteService);
  private readonly auth = inject(AuthService);
  private readonly notificationOnboarding = inject(NotificationOnboardingService);

  readonly state = signal<State>('loading');
  readonly preview = signal<AthleteInvitePreview | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly token = signal<string | null>(null);

  readonly form = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirmation: ['', Validators.required],
      privacy_accepted: [false, Validators.requiredTrue],
      terms_accepted: [false, Validators.requiredTrue],
    },
    { validators: this.passwordsMatch },
  );

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.state.set('invalid');
      return;
    }
    this.token.set(token);

    this.inviteService.preview(token).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.state.set('ready');
      },
      error: () => {
        this.state.set('invalid');
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const token = this.token();
    if (token === null) return;

    this.state.set('submitting');
    this.errorMessage.set(null);

    this.inviteService
      .accept(token, {
        password: this.form.value.password!,
        password_confirmation: this.form.value.password_confirmation!,
        accept_privacy: true,
        accept_terms: true,
      })
      .pipe(
        finalize(() => {
          if (this.state() === 'submitting') this.state.set('ready');
        }),
      )
      .subscribe({
        next: (data) => {
          // Store the Sanctum bearer in the same shape the standard
          // login flow uses, so the SPA's auth state hydrates from
          // here onwards (the user object, role-aware redirect, etc.).
          this.auth.adoptIssuedToken(data.token);
          // #745 — fire the post-registration soft prompt before
          // navigating so the dialog mounts at the app root while the
          // athlete dashboard hydrates underneath. Skip conditions live
          // inside the service (already decided, permission != default,
          // unsupported browser).
          this.notificationOnboarding.requestPromptAfterAuth();
          // Athletes land on /dashboard/me/profile — the athlete-side
          // dashboard shell landed in #610 (M7 PR-D slice 1). The
          // owner-side /dashboard tree is guarded by `roleOwnerGuard`
          // and `hasAcademyGuard`, both of which would bounce an
          // athlete who lacks an academy by definition. /dashboard/me/*
          // is `roleAthleteGuard`-gated instead.
          void this.router.navigate(['/dashboard/me/profile']);
        },
        error: (err) => {
          this.state.set('error');
          // Surface the precise server-side error code so the UI can
          // render a tailored message. The server's validation
          // envelope is `{ message, errors: { <field>: [code, ...] } }`
          // — we scan the priority order (token → email → password)
          // because token errors are the most informative for the
          // user, then email collisions, then password issues. Without
          // the password branch a HIBP-breach reject (server-only
          // validator, can't be pre-flighted client-side) fell through
          // to the generic "Qualcosa è andato storto" — verbatim user
          // report from Elizabeth on prod, where she had no way to
          // know her chosen password was rejected as breached.
          const errors = err?.error?.errors ?? {};
          const code: string | undefined =
            errors?.token?.[0] ?? errors?.email?.[0] ?? errors?.password?.[0];
          this.errorMessage.set(code ?? 'unknown_error');
        },
      });
  }

  private passwordsMatch(g: AbstractControl) {
    const pw = g.get('password')?.value;
    const confirm = g.get('password_confirmation')?.value;
    return pw === confirm ? null : { mismatch: true };
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
