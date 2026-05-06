import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import {
  Athlete,
  AthleteInvitationSummary,
  AthleteService,
} from '../../../../core/services/athlete.service';

/**
 * "Account & invito" card on the athlete detail page (#467, M7 PR-B-UI).
 * Three rendered states driven by the athlete's `invitation` field:
 *
 * - **No invitation + athlete has email** → "Invita al sistema" button.
 * - **Pending** → "Invito inviato il DD/MM, scade DD/MM" chip + "Invia
 *   di nuovo" + "Revoca".
 * - **Accepted** → "Atleta registrato il DD/MM" chip + small icon.
 * - **Athlete has no email on file** → empty-state explainer (Norman §
 *   constraints — surface the prerequisite rather than disabling a
 *   button with no context).
 *
 * The card owns its OWN copy of the invitation summary, seeded from the
 * input on first render. After invite / resend / revoke the local copy
 * updates so the UI reflects the action immediately without a full
 * detail refetch — Doherty Threshold + Norman § feedback. The parent's
 * `Athlete` signal stays as it was; the next page load reads fresh.
 */
@Component({
  selector: 'app-athlete-invitation-card',
  standalone: true,
  imports: [ButtonModule, CardModule, ConfirmPopup, TagModule, TranslatePipe],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invitation-card.component.html',
  styleUrl: './invitation-card.component.scss',
})
export class InvitationCardComponent {
  private readonly athleteService = inject(AthleteService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  /** The athlete whose invitation card we render. */
  readonly athlete = input.required<Athlete>();

  /**
   * The card's own copy of the invitation summary. Seeded by a
   * `computed` that re-evaluates when the input athlete changes,
   * but mutated locally on action success so the UI flips
   * immediately. `null` ⇒ no active invitation (the "send" state).
   */
  protected readonly invitation = signal<AthleteInvitationSummary | null>(null);

  /** True while a POST /invite is in flight. */
  protected readonly sending = signal<boolean>(false);
  /** True while a POST /invite/resend is in flight. */
  protected readonly resending = signal<boolean>(false);
  /** True while a DELETE /invitations/{id} is in flight. */
  protected readonly revoking = signal<boolean>(false);

  /** Athlete has no email — the "send invite" prerequisite is unmet. */
  protected readonly hasEmail = computed(() => (this.athlete().email ?? '').trim() !== '');

  /** True when the input athlete changes (re-seed local invitation copy). */
  private readonly seed = computed(() => {
    const a = this.athlete();
    this.invitation.set(a.invitation ?? null);
    return a.id;
  });

  constructor() {
    // Force the seed computed to evaluate on every input change. Reading
    // it inside an effect would be cleaner, but a constructor read in an
    // injection context establishes the same reactive subscription
    // without an extra import — keeps the card lean.
    this.seed();
  }

  /**
   * Send a fresh invite. The action's response is the full
   * `AthleteInvitation`; we project it into the lighter
   * `AthleteInvitationSummary` shape the card renders, mirroring what
   * the server emits on the next `GET /athletes/{id}` so the local
   * state matches a follow-up refetch.
   */
  invite(): void {
    if (this.sending()) return;

    this.sending.set(true);
    this.athleteService
      .invite(this.athlete().id)
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (inv) => {
          this.invitation.set({
            id: inv.id,
            state: 'pending',
            sent_at: inv.last_sent_at,
            expires_at: inv.expires_at,
            accepted_at: null,
          });
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.invitation.toast.invitedSummary'),
            life: 2500,
          });
        },
        error: (err: { error?: { errors?: Record<string, unknown> } }) => {
          this.surfaceError(err);
        },
      });
  }

  /**
   * Resend the pending invite. Server's re-use semantics mean the row
   * stays the same — only `last_sent_at` and the token rotate. The
   * card bumps `sent_at` locally so the chip shows the fresh send date.
   */
  resend(): void {
    if (this.resending()) return;

    this.resending.set(true);
    this.athleteService
      .resendInvite(this.athlete().id)
      .pipe(finalize(() => this.resending.set(false)))
      .subscribe({
        next: (inv) => {
          const current = this.invitation();
          this.invitation.set({
            id: inv.id,
            state: 'pending',
            sent_at: inv.last_sent_at,
            expires_at: inv.expires_at,
            accepted_at: current?.accepted_at ?? null,
          });
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.invitation.toast.resentSummary'),
            life: 2500,
          });
        },
        error: (err: { error?: { errors?: Record<string, unknown> } }) => {
          this.surfaceError(err);
        },
      });
  }

  /**
   * Confirm-then-revoke for the pending invite (Krug § forgiveness for
   * mistakes). Same `p-confirmpopup` pattern the avatar-remove flow
   * uses on the profile page.
   */
  confirmRevoke(event: Event): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: this.translate.instant('athletes.invitation.confirm.revokeMessage'),
      acceptLabel: this.translate.instant('athletes.invitation.confirm.revokeAccept'),
      rejectLabel: this.translate.instant('athletes.invitation.confirm.revokeReject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.revoke(),
    });
  }

  private revoke(): void {
    const current = this.invitation();
    if (current === null || this.revoking()) return;

    this.revoking.set(true);
    this.athleteService
      .revokeInvite(this.athlete().id, current.id)
      .pipe(finalize(() => this.revoking.set(false)))
      .subscribe({
        next: () => {
          // Server-side the row is now revoked; the SPA returns to the
          // "no active invitation" state.
          this.invitation.set(null);
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.invitation.toast.revokedSummary'),
            life: 2500,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.invitation.toast.revokeErrorSummary'),
            detail: this.translate.instant('athletes.invitation.toast.revokeErrorDetail'),
            life: 4000,
          });
        },
      });
  }

  /**
   * Maps the server's 422 envelope to a human-readable toast. The two
   * pre-flight rejections from `SendAthleteInvitationAction`:
   *
   * - `email_missing` — never reached in practice from this UI (the
   *   "Invita" button only renders when `hasEmail()` is true) but
   *   surfaced anyway for completeness.
   * - `email_already_registered` — the athlete's email already
   *   belongs to a Budojo user. Anti-squatting; cannot be invited.
   *
   * Anything else collapses to a generic error toast.
   */
  private surfaceError(err: { error?: { errors?: Record<string, unknown> } }): void {
    const errors = err.error?.errors ?? {};
    let detailKey: string | null = null;
    if ('email_missing' in errors) {
      detailKey = 'athletes.invitation.toast.errorEmailMissing';
    } else if ('email_already_registered' in errors) {
      detailKey = 'athletes.invitation.toast.errorEmailRegistered';
    }
    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant('athletes.invitation.toast.errorSummary'),
      detail:
        detailKey !== null
          ? this.translate.instant(detailKey)
          : this.translate.instant('athletes.invitation.toast.errorGeneric'),
      life: 5000,
    });
  }
}
