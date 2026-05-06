import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import {
  Athlete,
  AthleteEmailChangeMode,
  AthleteService,
} from '../../../../core/services/athlete.service';

/**
 * Owner-side email-change card on athlete detail (#476). The card
 * runs in three states, mirroring the action's branches:
 *
 * - **State A** (no `latestActiveInvitation`, no `user_id`) — free
 *   edit; on submit the action mutates `athletes.email` directly. The
 *   confirm dialog is omitted since no mail goes out.
 * - **State B** (pending invitation, no `user_id`) — pencil → confirm
 *   dialog "the current invitation will be revoked and a new one will
 *   be sent to {newEmail}" → on submit the server revokes + reissues
 *   atomically. The card emits an `athleteChanged` signal so the
 *   parent detail page can refetch the athlete (so the invitation
 *   card flips to "pending" with the new `last_sent_at`).
 * - **State C** (`user_id !== null`) — pencil → confirm dialog "the
 *   athlete needs to confirm by clicking a link" → on submit the
 *   server creates a pending row + queues the verification mail. The
 *   live `athletes.email` stays untouched until the athlete confirms;
 *   the parent doesn't need a refetch.
 *
 * Embedded as a sibling to the invitation card in
 * `AthleteDetailComponent`'s template. Lives outside the existing
 * athlete-form to keep the form's PUT semantics intact for state-A
 * email changes done as part of a broader athlete edit; this card
 * surfaces a dedicated entry point for cases where the email change
 * needs the verification round-trip.
 */
@Component({
  selector: 'app-athlete-email-change-card',
  standalone: true,
  imports: [
    ButtonModule,
    CardModule,
    ConfirmDialog,
    InputTextModule,
    ReactiveFormsModule,
    TooltipModule,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './email-change-card.component.html',
  styleUrl: './email-change-card.component.scss',
})
export class EmailChangeCardComponent {
  private readonly athleteService = inject(AthleteService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  /** The athlete whose email we render + change. */
  readonly athlete = input.required<Athlete>();

  /** Emitted after a state-B `invite_swap` succeeds — parent should refetch. */
  readonly athleteChanged = output<void>();

  protected readonly editing = signal<boolean>(false);
  protected readonly submitting = signal<boolean>(false);

  /**
   * Server-mapped error for the inline form. Same five-branch shape as
   * the profile-side counterpart but rendered with athlete-detail copy.
   */
  protected readonly serverError = signal<
    'invalid' | 'taken' | 'unchanged' | 'throttled' | 'generic' | null
  >(null);

  /**
   * State discriminator read off the athlete's invitation + user_id.
   * Drives the confirm-dialog copy.
   */
  protected readonly mode = computed<'A' | 'B' | 'C'>(() => {
    const a = this.athlete();
    if (a.invitation?.state === 'accepted') return 'C';
    if (a.invitation?.state === 'pending') return 'B';
    // The summary doesn't carry `user_id`; the parent component sets
    // an `accepted` invitation when the athlete is linked, so absence
    // of an active invitation = state A.
    return 'A';
  });

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
  });

  protected get emailControl() {
    return this.form.get('email')!;
  }

  protected get fieldError(): { dataCy: string; key: string } | null {
    const ctrl = this.emailControl;
    if (ctrl.touched) {
      if (ctrl.errors?.['required']) {
        return {
          dataCy: 'athlete-email-required',
          key: 'account.emailChange.profile.required',
        };
      }
      if (ctrl.errors?.['email']) {
        return {
          dataCy: 'athlete-email-invalid',
          key: 'account.emailChange.profile.invalid',
        };
      }
      if (ctrl.errors?.['maxlength']) {
        return {
          dataCy: 'athlete-email-maxlength',
          key: 'account.emailChange.profile.maxLength',
        };
      }
    }
    const code = this.serverError();
    if (code === 'taken') {
      return {
        dataCy: 'athlete-email-server-taken',
        key: 'account.emailChange.profile.serverEmailTaken',
      };
    }
    if (code === 'unchanged') {
      return {
        dataCy: 'athlete-email-server-unchanged',
        key: 'account.emailChange.profile.serverEmailUnchanged',
      };
    }
    if (code === 'throttled') {
      return {
        dataCy: 'athlete-email-server-throttled',
        key: 'account.emailChange.profile.serverThrottled',
      };
    }
    if (code === 'invalid') {
      return {
        dataCy: 'athlete-email-server-invalid',
        key: 'account.emailChange.profile.serverInvalid',
      };
    }
    if (code === 'generic') {
      return {
        dataCy: 'athlete-email-server-generic',
        key: 'account.emailChange.profile.serverGeneric',
      };
    }
    return null;
  }

  startEdit(): void {
    this.form.reset({ email: '' });
    this.serverError.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.serverError.set(null);
  }

  /**
   * Submit handler. State A skips the confirm dialog (no mail goes
   * out, no other side-effects); states B + C trigger a confirm
   * dialog with state-specific copy before the request fires.
   */
  submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const newEmail = (this.form.getRawValue().email ?? '').trim();
    const currentEmail = this.athlete().email ?? '';
    const stateMode = this.mode();

    if (stateMode === 'A') {
      this.dispatchChange(newEmail);
      return;
    }

    const headerKey =
      stateMode === 'B'
        ? 'account.emailChange.athleteDetail.confirmStateBTitle'
        : 'account.emailChange.athleteDetail.confirmStateCTitle';
    const messageKey =
      stateMode === 'B'
        ? 'account.emailChange.athleteDetail.confirmStateBMessage'
        : 'account.emailChange.athleteDetail.confirmStateCMessage';

    this.confirmationService.confirm({
      header: this.translate.instant(headerKey),
      message: this.translate.instant(messageKey, { newEmail, currentEmail }),
      acceptLabel: this.translate.instant('account.emailChange.athleteDetail.confirmAccept'),
      rejectLabel: this.translate.instant('account.emailChange.athleteDetail.confirmReject'),
      accept: () => this.dispatchChange(newEmail),
    });
  }

  private dispatchChange(newEmail: string): void {
    this.submitting.set(true);
    this.athleteService
      .changeEmail(this.athlete().id, newEmail)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: ({ mode }) => this.handleSuccess(mode, newEmail),
        error: (err: { status?: number; error?: { errors?: Record<string, unknown> } }) => {
          this.handleError(err);
        },
      });
  }

  private handleSuccess(mode: AthleteEmailChangeMode, newEmail: string): void {
    this.editing.set(false);
    if (mode === 'direct') {
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('account.emailChange.athleteDetail.toast.directSummary'),
        life: 2500,
      });
      // Direct edit mutated `athletes.email` server-side; tell the
      // parent so the detail header refreshes.
      this.athleteChanged.emit();
    } else if (mode === 'invite_swap') {
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant(
          'account.emailChange.athleteDetail.toast.inviteSwapSummary',
        ),
        detail: this.translate.instant('account.emailChange.athleteDetail.toast.inviteSwapDetail', {
          newEmail,
        }),
        life: 4000,
      });
      this.athleteChanged.emit();
    } else {
      // pending — `athletes.email` is unchanged on the wire until the
      // athlete confirms via the verification link, so no refetch.
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('account.emailChange.athleteDetail.toast.pendingSummary'),
        detail: this.translate.instant('account.emailChange.athleteDetail.toast.pendingDetail', {
          newEmail,
        }),
        life: 4000,
      });
    }
  }

  private handleError(err: {
    status?: number;
    error?: { errors?: Record<string, unknown> };
  }): void {
    if (err.status === 429) {
      this.serverError.set('throttled');
      return;
    }
    const errors = err.error?.errors ?? {};
    const emailErrors = errors['email'];
    const code =
      Array.isArray(emailErrors) && typeof emailErrors[0] === 'string' ? emailErrors[0] : null;
    if (code === 'email_taken') {
      this.serverError.set('taken');
    } else if (code === 'email_unchanged') {
      this.serverError.set('unchanged');
    } else if ('email' in errors) {
      this.serverError.set('invalid');
    } else {
      this.serverError.set('generic');
    }
  }
}
