import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ActiveSession, SessionService } from '../../../core/services/session.service';

/**
 * "Active sessions" panel on `/dashboard/profile` (#413).
 *
 * Lists every Sanctum session tied to the current user with a
 * device label, a last-used timestamp, and a per-row revoke action.
 * Stamps a "this session" pill on the row that authenticated the
 * page. Header CTA "Revoke all others" wipes every session except
 * the current one — the standard "I lost my laptop" remediation.
 *
 * Renders inside the profile page's card chrome. No standalone
 * route; the component is composed into the profile template.
 */
@Component({
  selector: 'app-profile-sessions',
  standalone: true,
  imports: [
    ButtonModule,
    ConfirmPopupModule,
    DatePipe,
    ProgressSpinnerModule,
    TooltipModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-sessions.component.html',
  styleUrl: './profile-sessions.component.scss',
  providers: [ConfirmationService],
})
export class ProfileSessionsComponent implements OnInit {
  private readonly sessionService = inject(SessionService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal<boolean>(true);
  protected readonly sessions = signal<readonly ActiveSession[]>([]);
  protected readonly revokingId = signal<number | null>(null);
  protected readonly revokingOthers = signal<boolean>(false);
  protected readonly errored = signal<boolean>(false);

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.sessionService.list().subscribe({
      next: (rows) => {
        this.sessions.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  /**
   * Revoke a single session. Two-step UX: a `p-confirmpopup` anchored
   * to the clicked button so a fat-finger doesn't kill an active
   * session by accident — Krug § Forgiveness for mistakes.
   */
  protected confirmRevoke(event: MouseEvent, session: ActiveSession): void {
    this.confirmationService.confirm({
      // `currentTarget` (the element the listener is bound to) is the
      // p-button host; `event.target` can be an inner `<span>` or
      // `<i>` (PrimeNG icon) which mis-anchors the popup. Matches the
      // pattern used by the rest of the app.
      target: event.currentTarget as EventTarget,
      message: this.translate.instant(
        session.is_current
          ? 'profile.sessions.confirmRevokeCurrent'
          : 'profile.sessions.confirmRevoke',
        { device: session.name },
      ),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('profile.sessions.confirmAccept'),
      rejectLabel: this.translate.instant('profile.sessions.confirmReject'),
      acceptButtonProps: { severity: 'danger', size: 'small' },
      rejectButtonProps: { severity: 'secondary', size: 'small', text: true },
      accept: () => this.revoke(session),
    });
  }

  private revoke(session: ActiveSession): void {
    this.revokingId.set(session.id);
    this.sessionService.revoke(session.id).subscribe({
      next: () => {
        // Clear the per-row spinner BEFORE the early-return path so a
        // current-session revoke doesn't leave the row stuck in a
        // permanent loading state if the auth interceptor takes a
        // beat to bounce. Symmetric with the other branches.
        this.revokingId.set(null);

        // The CURRENT session was just revoked — the next request
        // bounces on 401 and the auth interceptor handles the
        // sign-out. Don't refresh the list (the call would also
        // bounce). Stay put; the auth-interceptor takes over.
        if (session.is_current) {
          return;
        }
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.sessions.revokeToast.summary'),
          detail: this.translate.instant('profile.sessions.revokeToast.detail', {
            device: session.name,
          }),
          life: 4000,
        });
        this.refresh();
      },
      error: () => {
        this.revokingId.set(null);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.sessions.revokeError.summary'),
          detail: this.translate.instant('profile.sessions.revokeError.detail'),
          life: 5000,
        });
      },
    });
  }

  protected confirmRevokeOthers(event: MouseEvent): void {
    this.confirmationService.confirm({
      // `currentTarget` (the element the listener is bound to) is the
      // p-button host; `event.target` can be an inner `<span>` or
      // `<i>` (PrimeNG icon) which mis-anchors the popup. Matches the
      // pattern used by the rest of the app.
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('profile.sessions.confirmRevokeOthers'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('profile.sessions.confirmAccept'),
      rejectLabel: this.translate.instant('profile.sessions.confirmReject'),
      acceptButtonProps: { severity: 'danger', size: 'small' },
      rejectButtonProps: { severity: 'secondary', size: 'small', text: true },
      accept: () => this.revokeOthers(),
    });
  }

  private revokeOthers(): void {
    this.revokingOthers.set(true);
    this.sessionService.revokeOthers().subscribe({
      next: (count) => {
        this.revokingOthers.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.sessions.revokeOthersToast.summary'),
          detail:
            count === 0
              ? this.translate.instant('profile.sessions.revokeOthersToast.detailNone')
              : this.translate.instant('profile.sessions.revokeOthersToast.detail', {
                  count,
                }),
          life: 4000,
        });
        this.refresh();
      },
      error: () => {
        this.revokingOthers.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.sessions.revokeError.summary'),
          detail: this.translate.instant('profile.sessions.revokeError.detail'),
          life: 5000,
        });
      },
    });
  }

  protected hasOtherSessions(): boolean {
    return this.sessions().some((s) => !s.is_current);
  }
}
