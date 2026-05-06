import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
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
import { LanguageService } from '../../../../core/services/language.service';
import { localeFor } from '../../../../shared/utils/locale';

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
export class InvitationCardComponent implements OnInit {
  private readonly athleteService = inject(AthleteService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  /** The athlete whose invitation card we render. */
  readonly athlete = input.required<Athlete>();

  /**
   * The card's own copy of the invitation summary, seeded from the
   * input in `ngOnInit` and mutated locally on every action success
   * so the UI reflects the change without a full detail refetch
   * (Doherty Threshold + Norman § feedback). The parent's `Athlete`
   * signal stays as it was; the next page load reads fresh.
   *
   * `null` ⇒ no active invitation (the "send" state).
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

  /**
   * Translation params for the pending-state chip. The chip copy is
   * `"Invitation sent on {{sentAt}}, expires on {{expiresAt}}"` —
   * `sentAt` and `expiresAt` need to be locale-formatted day-first
   * strings (`05/05/2026`), NOT raw ISO-8601, otherwise the SPA
   * surfaces `2026-05-05T10:00:00Z` to the owner. Reads
   * `LanguageService.currentLang` so the formatting follows the
   * sidebar locale toggle in real time.
   */
  protected readonly pendingChipParams = computed<{ sentAt: string; expiresAt: string } | null>(
    () => {
      const inv = this.invitation();
      if (inv === null || inv.state !== 'pending') return null;
      const lang = this.languageService.currentLang();
      return {
        sentAt: this.formatDate(inv.sent_at, lang),
        expiresAt: this.formatDate(inv.expires_at, lang),
      };
    },
  );

  /** Translation params for the accepted-state chip. */
  protected readonly acceptedChipParams = computed<{ acceptedAt: string } | null>(() => {
    const inv = this.invitation();
    if (inv === null || inv.state !== 'accepted') return null;
    const lang = this.languageService.currentLang();
    return { acceptedAt: this.formatDate(inv.accepted_at, lang) };
  });

  /**
   * Locale-aware DD/MM/YYYY render of an ISO-8601 timestamp. Returns
   * the empty string when the input is null — every state that needs
   * a date carries a non-null source server-side, so a non-empty
   * fallback would mask a real bug rather than gracefully degrade.
   */
  private formatDate(iso: string | null, lang: 'en' | 'it'): string {
    if (iso === null) return '';
    const date = new Date(iso);
    return new Intl.DateTimeFormat(localeFor(lang), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  ngOnInit(): void {
    // The required input is bound by the time `ngOnInit` runs — reading
    // `athlete()` in the constructor would throw NG0950 because Angular
    // sets inputs AFTER the constructor returns.
    this.invitation.set(this.athlete().invitation ?? null);
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
        error: (err: { error?: { errors?: { email?: string[] } } }) => {
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
        error: (err: { error?: { errors?: { email?: string[] } } }) => {
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
   * The action throws `ValidationException::withMessages(['email' =>
   * 'email_missing'])` — Laravel keys validation errors by FIELD, not
   * by message. The wire shape is therefore `errors.email[0] ===
   * 'email_missing'`. Reading the message off the `email` array
   * mirrors `AthleteInviteComponent`'s pattern.
   *
   * Anything else collapses to a generic error toast.
   */
  private surfaceError(err: { error?: { errors?: { email?: string[] } } }): void {
    const code = err.error?.errors?.email?.[0];
    let detailKey: string | null = null;
    if (code === 'email_missing') {
      detailKey = 'athletes.invitation.toast.errorEmailMissing';
    } else if (code === 'email_already_registered') {
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
